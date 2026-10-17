class Discard:
    """接收任意类型的输入并将其丢弃，不输出任何内容。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "data": ("*", {}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "discard"
    CATEGORY = "Kinako"
    OUTPUT_NODE = True

    def discard(self, data):
        # 不保存、不返回任何数据
        return ()


NODE_CLASS_MAPPINGS = {
    "Discard": Discard,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Discard": "Discard",
}
