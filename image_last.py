class ImageBatchLast:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "get_last"
    CATEGORY = "Kinako"

    def get_last(self, image):
        # ComfyUI IMAGE: [batch, height, width, channels]
        if image.shape[0] <= 1:
            return (image,)
        last = image[-1:]
        return (last,)


NODE_CLASS_MAPPINGS = {
    "ImageBatchLast": ImageBatchLast,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageBatchLast": "Image Batch Last",
}
