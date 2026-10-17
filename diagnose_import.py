# -*- coding: utf-8 -*-
"""诊断脚本：复现 ComfyUI 加载本节点包的过程，打印具体失败原因。

使用方法（在 ComfyUI 根目录下，用 ComfyUI 自己的 Python 运行）：

    # 手动安装 (git clone + venv)：
    venv\\Scripts\\python.exe custom_nodes\\comfyui_kinako_nodes\\diagnose_import.py

    # Windows 便携版：
    ..\\..\\python_embeded\\python.exe custom_nodes\\comfyui_kinako_nodes\\diagnose_import.py

注意：脚本不依赖所在目录，会自动把所在包的父目录（即 custom_nodes）加入 sys.path。
"""

import os
import sys
import traceback

# Windows 控制台默认 GBK，强制 UTF-8 避免中文输出乱码
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

print("Python:", sys.version)
print("脚本位置:", os.path.abspath(__file__))

# 把 custom_nodes 目录（本包所在文件夹的上一级）加入 sys.path
package_dir = os.path.dirname(os.path.abspath(__file__))
custom_nodes_dir = os.path.dirname(package_dir)
sys.path.insert(0, custom_nodes_dir)
print("custom_nodes 目录:", custom_nodes_dir)

package_name = os.path.basename(package_dir)
print("包名:", package_name)

try:
    import torch
    print("torch: OK", torch.__version__)
except Exception:
    print("torch: 导入失败！")
    traceback.print_exc()

print("-" * 60)
try:
    module = __import__(package_name)
    print("包导入: OK")
    for key, value in module.NODE_CLASS_MAPPINGS.items():
        print("  节点:", key, "->", module.NODE_DISPLAY_NAME_MAPPINGS.get(key, "(无显示名)"))
    print("共注册 %d 个节点" % len(module.NODE_CLASS_MAPPINGS))
    print("诊断结论: 包本身可以正常加载。若 ComfyUI 里仍看不到节点，")
    print("请检查：1) 是否完全重启了 ComfyUI；2) 浏览器是否 Ctrl+F5 强刷；")
    print("3) 是否有同名旧节点包（comfyui_kinako_image_* 等）同时存在。")
except Exception:
    print("包导入: 失败！这就是 ComfyUI 节点列表不显示的原因，错误如下：")
    traceback.print_exc()
