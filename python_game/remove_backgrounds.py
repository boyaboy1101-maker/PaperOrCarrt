import os
from PIL import Image

# 图片路径
PIC_DIR = os.path.join("data", "pic")
TARGET_FILES = ["cat1.png", "cat_left.png", "cat_right.png"]

def remove_white_background(image, threshold=240):
    img = image.convert("RGBA")
    datas = img.getdata()
    
    new_data = []
    for item in datas:
        # 如果 RGB 值都大于阈值 (接近白色)，则将其 Alpha 设为 0 (透明)
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    return img

def process_images():
    for filename in TARGET_FILES:
        file_path = os.path.join(PIC_DIR, filename)
        
        if not os.path.exists(file_path):
            print(f"Warning: {filename} not found at {file_path}, skipping.")
            continue
            
        print(f"Processing {filename}...")
        
        try:
            # 读取图片
            input_image = Image.open(file_path)
            
            # 移除白色背景
            output_image = remove_white_background(input_image)
            
            # 保存回原路径 (覆盖)
            output_image.save(file_path, "PNG")
            print(f"Successfully removed white background for {filename}")
            
        except Exception as e:
            print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    if not os.path.exists(PIC_DIR):
        print(f"Error: Directory {PIC_DIR} does not exist.")
    else:
        process_images()
