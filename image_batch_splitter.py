try:
    from comfy_execution.graph import ExecutionBlocker
except ImportError:  # 旧版 ComfyUI 没有 ExecutionBlocker
    ExecutionBlocker = None


def _empty_output():
    # 未用到的输出：静默阻断下游节点执行，而不是把 None 传下去让下游报错
    return ExecutionBlocker(None) if ExecutionBlocker is not None else None


class ImageBatchSplitter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "split_size": (
                    "INT",
                    {
                        "default": 10,
                        "min": 1,
                        "max": 9999,
                        "step": 1,
                    },
                ),
                "out_count": (
                    "INT",
                    {
                        "default": 4,
                        "min": 1,
                        "max": 16,
                        "step": 1,
                    },
                ),
            }
        }

    RETURN_TYPES = tuple(["IMAGE"] * 16)
    RETURN_NAMES = tuple([f"image_{i+1}" for i in range(16)])
    FUNCTION = "split_batch"
    CATEGORY = "Kinako"

    def split_batch(self, image, split_size, out_count):
        total = image.shape[0]
        needed = (total + split_size - 1) // split_size
        actual = min(needed, out_count)

        result = []
        start = 0
        for i in range(16):
            if i < actual:
                if i == actual - 1:
                    end = total
                else:
                    end = min(start + split_size, total)
                result.append(image[start:end])
                start = end
            else:
                result.append(_empty_output())

        return tuple(result)


NODE_CLASS_MAPPINGS = {
    "ImageBatchSplitter": ImageBatchSplitter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageBatchSplitter": "Image Batch Splitter",
}
