from . import (
    discard,
    image_batch_splitter,
    image_crop_loader,
    image_last,
    image_wh,
    openapi_chat,
    scene_text_splitter,
    solid_color_image,
    video_frame_picker,
)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

for _module in (
    discard,
    image_batch_splitter,
    image_crop_loader,
    image_last,
    image_wh,
    openapi_chat,
    scene_text_splitter,
    solid_color_image,
    video_frame_picker,
):
    NODE_CLASS_MAPPINGS.update(_module.NODE_CLASS_MAPPINGS)
    NODE_DISPLAY_NAME_MAPPINGS.update(_module.NODE_DISPLAY_NAME_MAPPINGS)

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
