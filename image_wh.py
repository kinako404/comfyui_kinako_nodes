class ImageWidthHeight:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "max_side": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 16384,
                        "step": 1,
                    },
                ),
                "multiple": (["16", "32"],),
            }
        }

    RETURN_TYPES = ("INT", "INT", "STRING")
    RETURN_NAMES = ("width", "height", "text")
    FUNCTION = "get_dimensions"
    CATEGORY = "Kinako"

    @staticmethod
    def _align_to_multiple(value, multiple):
        aligned = int(round(value / float(multiple))) * multiple
        return max(multiple, aligned)

    def get_dimensions(self, image, max_side, multiple):
        multiple = int(multiple)
        # ComfyUI IMAGE: [batch, height, width, channels]
        height = int(image.shape[1])
        width = int(image.shape[2])

        if max_side and max_side > 0:
            longest = max(width, height)
            if longest > 0 and longest != max_side:
                scale = float(max_side) / float(longest)
                width = int(round(width * scale))
                height = int(round(height * scale))

        width = self._align_to_multiple(width, multiple)
        height = self._align_to_multiple(height, multiple)

        text = f"{width}x{height}"
        return (width, height, text)


NODE_CLASS_MAPPINGS = {
    "ImageWidthHeight": ImageWidthHeight,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageWidthHeight": "Image Width/Height",
}
