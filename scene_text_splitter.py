import re


class SceneTextSplitter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True}),
            }
        }

    RETURN_TYPES = (
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
    )
    RETURN_NAMES = (
        "scene_1",
        "scene_2",
        "scene_3",
        "scene_4",
        "scene_5",
        "scene_6",
        "scene_7",
        "scene_8",
        "scene_9",
        "scene_10",
        "scene_11",
        "scene_12",
        "scene_13",
        "scene_14",
        "scene_15",
        "scene_16",
    )
    FUNCTION = "split_scenes"
    CATEGORY = "Kinako"

    # 标题行 `[Scene N]:`（冒号可为全角 / 省略）；冒号后同一行的内容归入该场景
    _scene_re = re.compile(r"^\s*\[\s*Scene\s*(\d+)\s*\]\s*[:：]?\s*(.*)$", re.IGNORECASE)

    def split_scenes(self, text):
        lines = text.splitlines()
        scenes = {}
        current_idx = None
        buffer = []

        def flush():
            nonlocal buffer, current_idx
            if current_idx is not None:
                scenes[current_idx] = "\n".join(buffer).strip()
            buffer = []

        for line in lines:
            match = self._scene_re.match(line)
            if match:
                flush()
                current_idx = int(match.group(1))
                if match.group(2):
                    buffer.append(match.group(2))
                continue
            if current_idx is not None:
                buffer.append(line)

        flush()

        result = []
        for i in range(1, 17):
            result.append(scenes.get(i, ""))

        return tuple(result)


NODE_CLASS_MAPPINGS = {
    "SceneTextSplitter": SceneTextSplitter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SceneTextSplitter": "Scene Text Splitter",
}
