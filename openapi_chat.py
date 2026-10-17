import base64
import io
import json
import re
import urllib.error
import urllib.request

import numpy as np
from PIL import Image

MAX_IMAGES = 8
REQUEST_TIMEOUT = 300
MODELS_TIMEOUT = 30

DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODELS = [
    "gpt-4o-mini",
    "gpt-4o",
]

_THINK_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL | re.IGNORECASE)


def _post_json(url, payload, api_key, timeout=REQUEST_TIMEOUT):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    if api_key:
        req.add_header("Authorization", "Bearer " + api_key)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        raise RuntimeError("API 请求失败 HTTP %s: %s" % (exc.code, detail or exc.reason))
    except urllib.error.URLError as exc:
        raise RuntimeError("无法连接 API: %s" % exc.reason)


def _tensor_to_data_urls(tensor):
    """ComfyUI IMAGE tensor [batch, height, width, channels] -> PNG data URL 列表"""
    urls = []
    arr = tensor.detach().cpu().numpy()
    for frame in arr:
        img = Image.fromarray((np.clip(frame, 0.0, 1.0) * 255).astype(np.uint8))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        urls.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii"))
    return urls


def _split_thinking(text):
    """把 <think>...</think> 块从正文里拆出来，返回 (正文, 思考内容)"""
    parts = [m.strip() for m in _THINK_RE.findall(text) if m.strip()]
    cleaned = _THINK_RE.sub("", text).strip()
    return cleaned, "\n".join(parts)


def _fetch_models(base_url, api_key, timeout=MODELS_TIMEOUT):
    req = urllib.request.Request(base_url.rstrip("/") + "/models", method="GET")
    if api_key:
        req.add_header("Authorization", "Bearer " + api_key)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return sorted(
        m["id"] for m in data.get("data", []) if isinstance(m, dict) and m.get("id")
    )


class OpenAPISimpleChat:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {
            "system_prompt": ("STRING", {"multiline": True, "default": ""}),
        }
        for i in range(1, MAX_IMAGES + 1):
            optional["image_%d" % i] = ("IMAGE",)
        return {
            "required": {
                "base_url": ("STRING", {"default": DEFAULT_BASE_URL}),
                "api_key": ("STRING", {"default": ""}),
                "model": (DEFAULT_MODELS,),
                "prompt": ("STRING", {"multiline": True, "default": ""}),
                "temperature": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05},
                ),
                "max_tokens": ("INT", {"default": 4096, "min": 1, "max": 128000}),
                "enable_thinking": ("BOOLEAN", {"default": False}),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("response", "thinking")
    FUNCTION = "chat"
    CATEGORY = "Kinako"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        # model 下拉列表由「获取模型列表」动态刷新，值不在默认列表中属正常情况
        return True

    def chat(
        self,
        base_url,
        api_key,
        model,
        prompt,
        temperature,
        max_tokens,
        enable_thinking,
        system_prompt="",
        **kwargs,
    ):
        images = []
        for i in range(1, MAX_IMAGES + 1):
            tensor = kwargs.get("image_%d" % i)
            if tensor is not None:
                images.extend(_tensor_to_data_urls(tensor))

        messages = []
        if system_prompt and system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt})
        content = [{"type": "text", "text": prompt}]
        for url in images:
            content.append({"type": "image_url", "image_url": {"url": url}})
        messages.append({"role": "user", "content": content})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "chat_template_kwargs": {"enable_thinking": bool(enable_thinking)},
        }

        data = _post_json(base_url.rstrip("/") + "/chat/completions", payload, api_key)

        # 部分网关出错时仍返回 HTTP 200 + {"error": ...}，或 choices 为空 / null：
        # 明确报错，而不是静默输出空字符串（或 IndexError）
        choices = data.get("choices") if isinstance(data, dict) else None
        if not choices or not isinstance(choices[0], dict):
            error = data.get("error") if isinstance(data, dict) else None
            if isinstance(error, dict):
                error = error.get("message") or error
            raise RuntimeError("API 未返回有效结果: %s" % (error or str(data)[:500]))
        message = choices[0].get("message") or {}
        text = message.get("content") or ""
        thinking = message.get("reasoning_content") or message.get("reasoning") or ""

        text, inline_thinking = _split_thinking(text)
        thinking = "\n".join(t for t in (thinking.strip(), inline_thinking) if t)

        return (text, thinking)


try:
    import asyncio

    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.post("/kinako/openapi/models")
    async def _kinako_openapi_models(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "请求体不是合法 JSON"}, status=400)
        base_url = (body.get("base_url") or "").strip()
        api_key = body.get("api_key") or ""
        if not base_url:
            return web.json_response({"error": "base_url 不能为空"}, status=400)
        try:
            models = await asyncio.to_thread(_fetch_models, base_url, api_key)
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=502)
        return web.json_response({"models": models})

except Exception:
    pass


NODE_CLASS_MAPPINGS = {
    "OpenAPISimpleChat": OpenAPISimpleChat,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OpenAPISimpleChat": "OpenAPI 简易调用",
}
