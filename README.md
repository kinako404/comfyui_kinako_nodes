# Kinako Nodes

Kinako 自用的 ComfyUI 节点包：加载并拖拽裁剪图像、图像批次拆分、取批次末帧、宽高计算对齐、纯色图、
场景文本拆分、视频取帧、OpenAPI 兼容接口简易调用。所有节点都在 `Kinako` 分类下。

## 安装

```bash
cd /path/to/ComfyUI/custom_nodes
git clone https://github.com/kinako404/comfyui_kinako_nodes.git
# 重启 ComfyUI，并在浏览器 Ctrl+F5 强刷
```

无额外依赖（`torch` / `numpy` / `Pillow` 均随 ComfyUI 自带）。
「Video Frame Picker」需要支持 `VIDEO` 类型的较新版 ComfyUI。

## 节点

### Image Batch Splitter

把一个图像批次按 `split_size` 帧一组拆成最多 16 路输出。

- `split_size`：每组帧数
- `out_count`：输出路数（1~16）；改完后点节点上的「Update outputs」按钮刷新输出口
- 帧数超过 `split_size × out_count` 时，多出的帧全部并入最后一路
- 帧数不够、没有数据的输出口会静默跳过下游节点，不会报错

### Image Crop Loader (加载裁剪)

在节点里加载图像，并用鼠标拖拽裁剪框截出其中一块。

- 加载：点「加载图像」选择文件，或直接把图像文件拖到节点上；图像会上传到 ComfyUI 的 `input` 目录
  （与内置 Load Image 相同），工作流里只保存文件名和裁剪框
- 裁剪框：在框内拖动＝移动；拖 8 个手柄＝缩放（越过对边会翻转）；在框外拖动＝重新画框；
  「全图」把框重置为整张图
- `x` / `y` / `width` / `height`：裁剪框（原图像素），与拖拽双向同步，也可以直接输入数值
- `ratio`：比例约束（free / 1:1 / 4:3 / 3:4 / 16:9 / 9:16 / 3:2 / 2:3）
- `snap`：宽高对齐到 8 / 16 / 32 / 64 的倍数（`none` 不对齐）
- 输出：`image`（裁剪后的 RGB 图像）以及实际使用的 `x`、`y`、`width`、`height`
  （越界的框会被限制在图像内）
- 按 EXIF 方向转正（与浏览器显示一致）；动图只取第一帧；透明通道丢弃

### Image Batch Last

取图像批次的最后一帧（批次只有 1 帧时原样输出）。

### Image Width/Height

读取图像宽高，可选缩放并对齐到 16 / 32 的倍数。

- `max_side`：最长边缩放到该值并保持比例；`0` 表示不缩放
- `multiple`：对齐倍数（`16` / `32`），四舍五入到最近的倍数，最小为一个倍数
- 输出：`width`、`height`、`text`（如 `1024x576`）

### Solid Color Image

按指定宽高与颜色（`#RRGGBB` / `#RGB`）生成纯色图像。

### Scene Text Splitter

把带场景标记的文本拆成 16 路字符串输出 `scene_1` ~ `scene_16`：

```
[Scene 1]:
A girl walks into the forest.
[Scene 2]: She finds a glowing flower.
```

- 标记格式 `[Scene N]:`，不区分大小写，冒号可为全角 `：` 或省略
- 标记行冒号后的内容也归入该场景；没出现的场景输出空字符串

### Video Frame Picker (视频取帧)

从 `VIDEO` 输入取帧，三种模式：

- `第几帧`：按 `帧序号` 取一帧（从 0 开始），超出范围输出同分辨率黑图
- `百分比`：按视频进度 `百分比`（0~100）取最接近的一帧
- `均匀分割`：把视频均匀切成 `份数` 份，每份取首帧，以图像批次输出

### OpenAPI 简易调用

调用任意 OpenAI 兼容的 `/chat/completions` 接口（OpenAI、vLLM、Ollama、各类中转等）。

- `base_url`：接口地址，如 `https://api.openai.com/v1`
- `api_key`：密钥（可留空）
- `model`：点「获取模型列表」从 `{base_url}/models` 拉取可选模型
- `prompt` / `system_prompt`：用户提示词 / 系统提示词
- `temperature`、`max_tokens`
- `enable_thinking`：通过 `chat_template_kwargs.enable_thinking` 控制 Qwen3 等模型的思考模式
  （仅对支持该字段的服务端有效，如 vLLM / SGLang）
- 图像输入：连接一个 `image_N` 后自动出现下一个空槽，最多 8 个；批次中的每帧都会发送
- 输出：`response`（正文）、`thinking`（`reasoning_content` 或正文中的 `<think>` 内容）

> 注意：`api_key` 以明文保存在工作流里，分享工作流前请先清空。

### Discard

接收任意类型输入并丢弃，用于让某个分支被执行但不产生输出。

## 排查节点不显示

ComfyUI 里看不到节点时，在 ComfyUI 根目录用 ComfyUI 自带的 Python 运行诊断脚本，
它会复现加载过程并打印具体的导入错误：

```bash
# git clone + venv 安装
venv/bin/python custom_nodes/comfyui_kinako_nodes/diagnose_import.py
# Windows 便携版
..\..\python_embeded\python.exe custom_nodes\comfyui_kinako_nodes\diagnose_import.py
```

## License

MIT
