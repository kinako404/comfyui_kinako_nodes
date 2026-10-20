import hashlib

import folder_paths
import numpy as np
import torch
from PIL import Image, ImageOps

# 与前端 crop_math.js 的 RATIOS / SNAPS 保持一致；仅供前端裁剪框约束，后端只按 x/y/w/h 裁剪
RATIOS = ["free", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"]
SNAPS = ["none", "8", "16", "32", "64"]
MAX_SIZE = 16384


def _clamp_box(img_w, img_h, x, y, width, height):
    """把裁剪框限制在图像内，保证至少 1×1。"""
    x = min(max(int(x), 0), img_w - 1)
    y = min(max(int(y), 0), img_h - 1)
    w = min(max(int(width), 1), img_w - x)
    h = min(max(int(height), 1), img_h - y)
    return x, y, w, h


class ImageCropLoader:
    """加载图像并按节点内拖拽的裁剪框输出图像块。

    前端（web/js/image_crop_loader.js）负责上传图像到 input 目录、绘制和拖拽裁剪框，
    并把框写入 x / y / width / height；ratio / snap 只约束前端拖拽。
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("STRING", {"default": ""}),
                "x": ("INT", {"default": 0, "min": 0, "max": MAX_SIZE, "step": 1}),
                "y": ("INT", {"default": 0, "min": 0, "max": MAX_SIZE, "step": 1}),
                "width": ("INT", {"default": 512, "min": 1, "max": MAX_SIZE, "step": 1}),
                "height": ("INT", {"default": 512, "min": 1, "max": MAX_SIZE, "step": 1}),
                "ratio": (RATIOS,),
                "snap": (SNAPS,),
            }
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT", "INT", "INT")
    RETURN_NAMES = ("image", "x", "y", "width", "height")
    FUNCTION = "crop"
    CATEGORY = "Kinako"

    def crop(self, image, x, y, width, height, ratio="free", snap="none"):
        path = folder_paths.get_annotated_filepath(image)
        with Image.open(path) as img:
            # 与浏览器显示一致：按 EXIF 方向转正；动图只取第一帧；丢弃 alpha
            frame = ImageOps.exif_transpose(img).convert("RGB")
        x, y, w, h = _clamp_box(frame.width, frame.height, x, y, width, height)
        frame = frame.crop((x, y, x + w, y + h))
        tensor = torch.from_numpy(np.array(frame).astype(np.float32) / 255.0)[None,]
        return (tensor, x, y, w, h)

    @classmethod
    def IS_CHANGED(cls, image, **kwargs):
        m = hashlib.sha256()
        with open(folder_paths.get_annotated_filepath(image), "rb") as f:
            m.update(f.read())
        return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(cls, image):
        if not image:
            return "请先在节点里加载图像"
        if not folder_paths.exists_annotated_filepath(image):
            return "图像文件不存在: {}".format(image)
        return True


NODE_CLASS_MAPPINGS = {
    "ImageCropLoader": ImageCropLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageCropLoader": "Image Crop Loader (加载裁剪)",
}
