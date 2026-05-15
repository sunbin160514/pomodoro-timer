from PIL import Image, ImageDraw

def create_icon(size, filename):
    # 创建渐变背景
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 绘制圆形背景（番茄红色）
    margin = size // 8
    draw.ellipse([margin, margin, size-margin, size-margin], fill=(255, 107, 107, 255))
    
    # 绘制番茄的茎（绿色）
    stem_width = size // 8
    stem_height = size // 6
    center_x = size // 2
    top_margin = size // 6
    draw.polygon([
        (center_x - stem_width//2, margin + top_margin),
        (center_x + stem_width//2, margin + top_margin),
        (center_x, margin + top_margin - stem_height)
    ], fill=(78, 205, 196, 255))
    
    # 保存
    img.save(filename)
    print(f"Created {filename}")

# 创建图标
create_icon(512, '/Users/sunbin/Documents/Develop/first_cc/assets/icon.png')
create_icon(32, '/Users/sunbin/Documents/Develop/first_cc/assets/tray-icon.png')
