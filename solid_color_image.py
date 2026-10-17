import torch


class SolidColorImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "width": (
                    "INT",
                    {
                        "default": 512,
                        "min": 1,
                        "max": 16384,
                        "step": 1,
                    },
                ),
                "height": (
                    "INT",
                    {
                        "default": 512,
                        "min": 1,
                        "max": 16384,
                        "step": 1,
                    },
                ),
                "color": (
                    "COLOR",
                    {
                        "default": "#FF0000",
                    },
                ),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "generate"
    CATEGORY = "Kinako"

    @staticmethod
    def _hex_to_rgb(color):
        value = str(color).strip().lstrip("#")
        if len(value) == 3:
            value = "".join(c * 2 for c in value)
        try:
            r = int(value[0:2], 16) / 255.0
            g = int(value[2:4], 16) / 255.0
            b = int(value[4:6], 16) / 255.0
        except (ValueError, TypeError):
            r = g = b = 0.0
        return (r, g, b)

    def generate(self, width, height, color):
        r, g, b = self._hex_to_rgb(color)
        # ComfyUI IMAGE: [batch, height, width, channels], float 0-1
        pixel = torch.tensor([r, g, b], dtype=torch.float32)
        image = pixel.view(1, 1, 1, 3).repeat(1, height, width, 1)
        return (image,)


NODE_CLASS_MAPPINGS = {
    "SolidColorImage": SolidColorImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SolidColorImage": "Solid Color Image",
}
