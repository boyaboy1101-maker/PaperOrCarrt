from rembg import remove
from PIL import Image
import os

input_path = 'data/pic/cart1.png'
output_path = 'data/pic/cart1_processed.png'
ref_path = 'data/pic/carrot.png'

# 1. 去除背景
try:
    with open(input_path, 'rb') as i:
        with open(output_path, 'wb') as o:
            input_data = i.read()
            output_data = remove(input_data)
            o.write(output_data)
    print("Background removed.")
except Exception as e:
    print(f"Error removing background: {e}")
    # 如果 rembg 失败（可能因为模型下载问题），则直接复制原图或仅做大小调整
    # 这里我们假设它成功，或者如果失败就不处理背景只处理大小
    import shutil
    shutil.copy(input_path, output_path)

# 2. 调整大小
try:
    # 获取参考图片的大小
    with Image.open(ref_path) as ref_img:
        target_size = ref_img.size
        print(f"Target size: {target_size}")

    # 调整处理后的图片大小
    with Image.open(output_path) as img:
        # 保持比例缩放，或者强制缩放？用户说"调整大小和另外两张图片大小一致"
        # 通常意味着视觉大小一致。如果强制 resize 可能会变形。
        # 我们先尝试 resize 到相同高度，宽度自适应，或者 resize 到相同宽度。
        # 但既然是 UI 调整，最简单的是 resize 成正方形或者 fit 进去。
        # 考虑到用户意图是“大小一致”，我们强制 resize 到参考图片的尺寸（假设它们差不多大）
        resized_img = img.resize(target_size, Image.LANCZOS)
        resized_img.save(output_path)
        print(f"Image resized to {target_size}")
        
    # 覆盖原文件（可选，或者在 html 中引用新文件）
    # 为了安全，我们修改 html 引用新文件，或者备份原文件后覆盖
    # 这里我们选择保留新文件名，并将在下一步修改 html
    
except Exception as e:
    print(f"Error resizing image: {e}")
