from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.gzip import GZipMiddleware

app = FastAPI()

# 1. 开启 Gzip 压缩，减少传输体积
app.add_middleware(GZipMiddleware, minimum_size=1000)

# 2. 添加缓存控制中间件
@app.middleware("http")
async def add_cache_control_header(request: Request, call_next):
    response = await call_next(request)
    # 为静态资源设置强缓存 (1年)
    if request.url.path.endswith(('.png', '.jpg', '.jpeg', '.mp3', '.css', '.js')):
        response.headers["Cache-Control"] = "public, max-age=31536000"
    return response

# 3. 定义 API 接口：访问根路径时返回 index.html
@app.get("/")
async def read_index():
    return FileResponse('index.html')

# 4. 定义 API 接口：访问 camera 页面
@app.get("/camera.html")
async def read_camera():
    return FileResponse('camera.html')

# 5. 定义 API 接口：访问购物车游戏页面
@app.get("/cart_game.html")
async def read_cart_game():
    return FileResponse('cart_game.html')

# 6. 挂载静态文件
# 将当前目录挂载到 /static 路径下（如果需要）
# 或者更简单的方式：为了让 html 中的 <link href="style.css"> 等相对路径生效，
# 我们将当前目录挂载到 "/"，但放在最后作为 fallback，
# 这样定义的路由（如上面的 /）会先匹配。
# 注意：html=True 表示如果访问目录会自动寻找 index.html，但我们已经自定义了 "/" 路由。

app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # 使用 8082 端口避免权限问题或冲突
    uvicorn.run(app, host="0.0.0.0", port=8082)
