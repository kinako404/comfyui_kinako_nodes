import torch


class VideoFramePicker:
    """从视频中取帧。

    支持三种模式：
    - 第几帧：按帧序号取一帧（从 0 开始），超出范围时输出黑色画面；
    - 百分比：按视频进度百分比取近似一帧（0~100）；
    - 均匀分割：把视频均匀切成 N 份，每份取一帧，以图像批次输出。
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "视频": ("VIDEO",),
                "模式": (["第几帧", "百分比", "均匀分割"],),
                "帧序号": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 999999,
                        "step": 1,
                    },
                ),
                "百分比": (
                    "FLOAT",
                    {
                        "default": 50.0,
                        "min": 0.0,
                        "max": 100.0,
                        "step": 0.1,
                    },
                ),
                "份数": (
                    "INT",
                    {
                        "default": 10,
                        "min": 1,
                        "max": 9999,
                        "step": 1,
                    },
                ),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "pick_frame"
    CATEGORY = "Kinako"

    def pick_frame(self, 视频, 模式, 帧序号, 百分比, 份数):
        images = 视频.get_components().images
        total = int(images.shape[0])
        if total == 0:
            return (images,)

        if 模式 == "均匀分割":
            count = max(1, 份数)
            # 每份取该段的第一帧：0, total/count, 2*total/count, ...
            indices = [min(int(round(i * total / count)), total - 1) for i in range(count)]
            return (images[indices],)

        if 模式 == "百分比":
            index = int(round(百分比 / 100.0 * (total - 1)))
            index = max(0, min(index, total - 1))
        else:
            index = 帧序号

        if 0 <= index < total:
            frame = images[index : index + 1]
        else:
            # 帧超出范围：输出与视频分辨率一致的黑色画面
            frame = torch.zeros(
                (1, images.shape[1], images.shape[2], images.shape[3]),
                dtype=images.dtype,
                device=images.device,
            )

        return (frame,)


NODE_CLASS_MAPPINGS = {
    "VideoFramePicker": VideoFramePicker,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VideoFramePicker": "Video Frame Picker (视频取帧)",
}
