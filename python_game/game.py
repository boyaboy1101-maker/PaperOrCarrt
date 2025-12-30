import pygame
import random
import sys
import os

# 初始化 Pygame
pygame.init()
pygame.mixer.init()

# 游戏配置
WIDTH, HEIGHT = 480, 800  # 类似手机屏幕的比例
FPS = 60
GAME_DURATION = 30  # seconds

# 颜色定义
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
ORANGE = (255, 165, 0)
GRAY = (200, 200, 200)
GREEN = (50, 205, 50)
RED = (255, 69, 0)

# 初始化屏幕
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("萝卜 vs 纸巾：真棒挑战")
clock = pygame.time.Clock()

# 字体加载
try:
    # 尝试使用系统自带的中文字体，如果没有则回退到默认字体
    font_path = "C:/Windows/Fonts/msyh.ttc"  # Windows 微软雅黑
    if not os.path.exists(font_path):
        font_path = None
    
    title_font = pygame.font.Font(font_path, 40) if font_path else pygame.font.SysFont("arial", 40)
    text_font = pygame.font.Font(font_path, 24) if font_path else pygame.font.SysFont("arial", 24)
    score_font = pygame.font.Font(font_path, 36) if font_path else pygame.font.SysFont("arial", 36)
except:
    title_font = pygame.font.SysFont(None, 40)
    text_font = pygame.font.SysFont(None, 24)
    score_font = pygame.font.SysFont(None, 36)

# 资源路径
ASSET_DIR = "data"
PIC_DIR = os.path.join(ASSET_DIR, "pic")
AUDIO_DIR = os.path.join(ASSET_DIR, "audio")

# 加载图片
def load_image(name, size=None):
    try:
        path = os.path.join(PIC_DIR, name)
        img = pygame.image.load(path).convert_alpha()
        if size:
            img = pygame.transform.scale(img, size)
        return img
    except Exception as e:
        print(f"Error loading image {name}: {e}")
        # 返回一个颜色块作为占位符
        surf = pygame.Surface(size if size else (50, 50))
        surf.fill(RED)
        return surf

# 图片资源
cat_img_center = load_image("cat1.png", (140, 140))
cat_img_left = load_image("cat_left.png", (140, 140))
cat_img_right = load_image("cat_right.png", (140, 140))
carrot_img = load_image("carrot.png", (120, 120))
paper_img = load_image("paper.png", (120, 120))

# 加载音效
audio_cache = {}
def load_audio(path):
    if path not in audio_cache:
        try:
            audio_cache[path] = pygame.mixer.Sound(path)
        except Exception as e:
            print(f"Error loading audio {path}: {e}")
            return None
    return audio_cache[path]

AUDIO_FILES = {
    'paper': [os.path.join(AUDIO_DIR, "paper", f"paper_{i}.mp3") for i in [1, 2]],
    'carrot': [os.path.join(AUDIO_DIR, "carrot", f"carrot_{i}.mp3") for i in [1, 2]],
    'good': [os.path.join(AUDIO_DIR, "good", f"good_{i}.mp3") for i in [1, 2]],
    'wrong': [os.path.join(AUDIO_DIR, "wrong", "wrong.mp3")]
}

def play_random_audio(category):
    if category in AUDIO_FILES:
        files = AUDIO_FILES[category]
        if files:
            path = random.choice(files)
            sound = load_audio(path)
            if sound:
                sound.set_volume(0.7)
                sound.play()

# 游戏状态
class GameState:
    def __init__(self):
        self.state = "start"  # start, playing, ended
        self.score = 0
        self.combo = 0
        self.max_combo = 0
        self.praise_count = 0
        self.remaining_time = GAME_DURATION
        self.current_correct_type = None  # "carrot" or "tissue"
        self.input_locked = False
        self.question_text = ""
        self.hint_text = "帮猫猫选出主人心里的那个答案～"
        
        # 卡片位置
        self.card_y = HEIGHT - 250
        self.card_left_rect = pygame.Rect(40, self.card_y, 180, 200)
        self.card_right_rect = pygame.Rect(WIDTH - 220, self.card_y, 180, 200)
        
        # 卡片类型
        self.left_type = None
        self.right_type = None
        
        # 购物车位置
        self.cart_x = WIDTH // 2 - 70
        self.cart_y = self.card_y - 180  # 基于 HTML 中的 rowTop - 180
        self.cart_target_x = self.cart_x
        self.current_cat_img = cat_img_center
        
        # 返回按钮
        self.back_btn_rect = pygame.Rect(10, 10, 60, 30)
        
        # 反馈效果
        self.feedback_timer = 0
        self.feedback_color = None

    def reset(self):
        self.score = 0
        self.combo = 0
        self.max_combo = 0
        self.praise_count = 0
        self.remaining_time = GAME_DURATION
        self.input_locked = False
        self.hint_text = "帮猫猫选出主人心里的那个答案～"
        self.spawn_round()

    def spawn_round(self):
        # 重置购物车
        self.cart_target_x = WIDTH // 2 - 70
        self.current_cat_img = cat_img_center
        
        # 随机题目
        correct = "carrot" if random.random() < 0.5 else "tissue"
        self.current_correct_type = correct
        
        if correct == "carrot":
            self.question_text = "主人：帮我拍一拍萝卜～"
            play_random_audio("carrot")
        else:
            self.question_text = "主人：纸巾在哪儿？"
            play_random_audio("paper")
            
        # 随机分配左右卡片
        if random.random() < 0.5:
            self.left_type = correct
            self.right_type = "tissue" if correct == "carrot" else "carrot"
        else:
            self.right_type = correct
            self.left_type = "tissue" if correct == "carrot" else "carrot"

    def handle_input(self, pos):
        # 检查是否点击返回按钮
        if self.state == "playing" and self.back_btn_rect.collidepoint(pos):
            self.state = "start"
            return

        if self.input_locked or self.state != "playing":
            return

        selected_type = None
        is_left = False
        
        if self.card_left_rect.collidepoint(pos):
            selected_type = self.left_type
            is_left = True
        elif self.card_right_rect.collidepoint(pos):
            selected_type = self.right_type
            is_left = False
            
        if selected_type:
            self.input_locked = True
            
            # 移动购物车和切换图片
            if is_left:
                self.cart_target_x = self.card_left_rect.centerx - 70
                self.current_cat_img = cat_img_left
            else:
                self.cart_target_x = self.card_right_rect.centerx - 70
                self.current_cat_img = cat_img_right
                
            is_correct = (selected_type == self.current_correct_type)
            
            if is_correct:
                self.combo += 1
                self.praise_count += 1
                self.max_combo = max(self.max_combo, self.combo)
                
                multiplier = 1 + (self.combo // 3)
                self.score += 100 * multiplier
                
                self.hint_text = "真棒！继续！"
                self.feedback_color = GREEN
                play_random_audio("good")
            else:
                self.combo = 0
                self.hint_text = "这次没对，再试试~"
                self.feedback_color = RED
                play_random_audio("wrong")
                
            self.feedback_timer = pygame.time.get_ticks()
            
            # 延迟进入下一轮
            delay = 420 if is_correct else 300
            pygame.time.set_timer(pygame.USEREVENT + 1, delay)

# 实例化游戏
game = GameState()

# 绘制文本辅助函数
def draw_text(surface, text, font, color, center):
    text_obj = font.render(text, True, color)
    rect = text_obj.get_rect(center=center)
    surface.blit(text_obj, rect)

def draw_card(rect, type_name):
    # 绘制卡片背景
    pygame.draw.rect(screen, WHITE, rect, border_radius=15)
    pygame.draw.rect(screen, GRAY, rect, 2, border_radius=15)
    
    # 绘制图片
    img = carrot_img if type_name == "carrot" else paper_img
    img_rect = img.get_rect(center=(rect.centerx, rect.centery - 20))
    screen.blit(img, img_rect)
    
    # 绘制标签
    label = "萝卜" if type_name == "carrot" else "纸巾"
    draw_text(screen, label, text_font, BLACK, (rect.centerx, rect.bottom - 30))

# 主循环
running = True
while running:
    current_time = pygame.time.get_ticks()
    dt = clock.tick(FPS) / 1000.0
    
    # 事件处理
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        
        if event.type == pygame.MOUSEBUTTONDOWN:
            if game.state == "start":
                # 点击任意位置开始
                game.state = "playing"
                game.reset()
            elif game.state == "playing":
                game.handle_input(event.pos)
            elif game.state == "ended":
                # 点击重新开始
                game.state = "playing"
                game.reset()
                
        if event.type == pygame.USEREVENT + 1:
            # 定时器触发，进入下一轮
            pygame.time.set_timer(pygame.USEREVENT + 1, 0) # 清除定时器
            game.input_locked = False
            game.spawn_round()
            game.feedback_color = None

    # 更新逻辑
    if game.state == "playing":
        game.remaining_time -= dt
        if game.remaining_time <= 0:
            game.remaining_time = 0
            game.state = "ended"
            
        # 平滑移动购物车
        if abs(game.cart_x - game.cart_target_x) > 1:
            game.cart_x += (game.cart_target_x - game.cart_x) * 0.2
        else:
            game.cart_x = game.cart_target_x

    # 绘制
    screen.fill((240, 248, 255)) # 浅蓝色背景
    
    if game.state == "start":
        draw_text(screen, "萝卜 vs 纸巾", title_font, BLACK, (WIDTH//2, HEIGHT//3))
        draw_text(screen, "点击屏幕开始挑战", text_font, BLACK, (WIDTH//2, HEIGHT//2))
        
    elif game.state == "playing":
        # HUD
        # 绘制返回按钮
        pygame.draw.rect(screen, GRAY, game.back_btn_rect, border_radius=5)
        draw_text(screen, "返回", text_font, BLACK, game.back_btn_rect.center)
        
        # 调整时间显示位置，避开按钮，向左移动
        # 之前是 WIDTH//2 - 40，现在改为 140 (大致在按钮右侧)
        draw_text(screen, f"时间: {game.remaining_time:.1f}", text_font, BLACK, (140, 30))
        draw_text(screen, f"分数: {game.score}", score_font, ORANGE, (WIDTH//2 + 60, 30))
        draw_text(screen, f"连击: {game.combo}", text_font, RED, (WIDTH - 50, 30))
        
        # 问题和提示
        draw_text(screen, game.question_text, text_font, BLACK, (WIDTH//2, 100))
        draw_text(screen, game.hint_text, text_font, ORANGE, (WIDTH//2, 140))
        
        # 购物车 (猫咪)
        screen.blit(game.current_cat_img, (game.cart_x, game.cart_y))
        
        # 卡片
        draw_card(game.card_left_rect, game.left_type)
        draw_card(game.card_right_rect, game.right_type)
        
        # 反馈高亮
        # if game.feedback_color and pygame.time.get_ticks() - game.feedback_timer < 300:
        #    overlay = pygame.Surface((WIDTH, HEIGHT))
        #    overlay.set_alpha(50)
        #    overlay.fill(game.feedback_color)
        #    screen.blit(overlay, (0, 0))
            
    elif game.state == "ended":
        draw_text(screen, "挑战结束", title_font, BLACK, (WIDTH//2, HEIGHT//4))
        draw_text(screen, f"最终得分: {game.score}", score_font, ORANGE, (WIDTH//2, HEIGHT//2))
        draw_text(screen, f"最高连击: {game.max_combo}", text_font, BLACK, (WIDTH//2, HEIGHT//2 + 50))
        draw_text(screen, f"被夸次数: {game.praise_count}", text_font, BLACK, (WIDTH//2, HEIGHT//2 + 90))
        draw_text(screen, "点击屏幕重新开始", text_font, GRAY, (WIDTH//2, HEIGHT*3//4))

    pygame.display.flip()

pygame.quit()
sys.exit()