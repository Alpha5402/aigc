@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

REM =========================================================
REM 云上农管家 - 一键启动脚本
REM 放置位置：项目根目录，与 package.json、backend、model-service 同级
REM 启动内容：Node 后端 API + Python 算法服务 + UniApp H5 前端
REM =========================================================

set "ROOT=%~dp0"

if /I "%~1"=="api" goto API
if /I "%~1"=="model" goto MODEL
if /I "%~1"=="h5" goto H5

echo.
echo ========================================
echo   云上农管家 - 一键启动
echo ========================================
echo 项目根目录：%ROOT%
echo.
echo 即将打开 3 个窗口：
echo [1] 后端 API       npm run start:api
echo [2] 算法服务       uvicorn agricloud_forecast.main:app
echo [3] 前端 H5        npm run dev:h5
echo.

if not exist "%ROOT%package.json" (
  echo [错误] 当前 run.bat 不在项目根目录。
  echo 请把 run.bat 放到 package.json、backend、model-service 同级目录。
  pause
  exit /b 1
)

if not exist "%ROOT%backend" (
  echo [错误] 未找到 backend 目录。
  pause
  exit /b 1
)

if not exist "%ROOT%model-service" (
  echo [错误] 未找到 model-service 目录。
  pause
  exit /b 1
)

start "AgriCloud API 后端" cmd /k ""%~f0" api"
timeout /t 2 /nobreak >nul

start "AgriCloud Model 算法服务" cmd /k ""%~f0" model"
timeout /t 2 /nobreak >nul

start "AgriCloud H5 前端" cmd /k ""%~f0" h5"

echo.
echo 已启动 3 个窗口。
echo 前端地址一般会在 H5 窗口中显示，例如：http://localhost:5173
echo 算法健康检查：http://127.0.0.1:8000/health
echo.
pause
exit /b 0

:API
cd /d "%ROOT%"
echo.
echo ========================================
echo   启动后端 API
echo ========================================

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 npm，请先安装 Node.js。
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo [提示] 根目录 node_modules 不存在，正在执行 npm install...
  call npm install
  if errorlevel 1 (
    echo [错误] 根目录 npm install 失败。
    pause
    exit /b 1
  )
)

if exist "%ROOT%backend\package.json" if not exist "%ROOT%backend\node_modules" (
  echo [提示] backend/node_modules 不存在，正在安装后端依赖...
  cd /d "%ROOT%backend"
  call npm install
  if errorlevel 1 (
    echo [错误] 后端 npm install 失败。
    pause
    exit /b 1
  )
  cd /d "%ROOT%"
)

call npm run start:api
pause
exit /b 0

:MODEL
cd /d "%ROOT%model-service"
echo.
echo ========================================
echo   启动 Python 算法服务
echo ========================================

if not exist ".env" (
  if exist ".env.example" (
    echo [提示] model-service/.env 不存在，正在从 .env.example 复制...
    copy ".env.example" ".env" >nul
  )
)

REM 尝试把 backend/.env 中的 MODEL_SERVICE_SHARED_SECRET 同步到 model-service/.env 的 FORECAST_SHARED_SECRET
set "MODEL_SECRET="
if exist "%ROOT%backend\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%backend\.env") do (
    if /I "%%A"=="MODEL_SERVICE_SHARED_SECRET" set "MODEL_SECRET=%%B"
  )
)

if defined MODEL_SECRET (
  echo [提示] 正在同步算法服务共享密钥...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='.env'; $s=$env:MODEL_SECRET; if(Test-Path $p){$c=Get-Content $p -Raw; if($c -match '(?m)^FORECAST_SHARED_SECRET='){ $c=$c -replace '(?m)^FORECAST_SHARED_SECRET=.*',('FORECAST_SHARED_SECRET=' + $s) } else { $c = $c + [Environment]::NewLine + 'FORECAST_SHARED_SECRET=' + $s + [Environment]::NewLine }; Set-Content -Path $p -Value $c -Encoding UTF8 }"
) else (
  echo [警告] 未在 backend/.env 中找到 MODEL_SERVICE_SHARED_SECRET。
  echo        如果预测接口 401，请手动确认 model-service/.env 的 FORECAST_SHARED_SECRET 与后端一致。
)

if not exist ".venv\Scripts\python.exe" (
  echo [提示] Python 虚拟环境不存在，正在创建 .venv...
  py -3.11 -m venv .venv
  if errorlevel 1 (
    echo [提示] py -3.11 不可用，尝试使用 python 创建虚拟环境...
    python -m venv .venv
  )
  if errorlevel 1 (
    echo [错误] 创建 Python 虚拟环境失败。请确认已安装 Python 3.11 或更高版本。
    pause
    exit /b 1
  )
)

call ".venv\Scripts\activate.bat"

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,11) else 1)" >nul 2>nul
if errorlevel 1 (
  echo [错误] 当前虚拟环境 Python 版本低于 3.11，请安装 Python 3.11+ 后删除 model-service\.venv 再重试。
  python --version
  pause
  exit /b 1
)

python -c "import agricloud_forecast" >nul 2>nul
if errorlevel 1 (
  echo [提示] 正在安装算法服务依赖，首次运行可能较慢...
  python -m pip install --upgrade pip
  python -m pip install -e ".[dev]"
  if errorlevel 1 (
    echo [错误] 算法服务依赖安装失败。
    echo        可尝试手动进入 model-service 后执行：pip install -e ".[dev]"
    pause
    exit /b 1
  )
)

echo.
echo [启动] http://127.0.0.1:8000/health
python -m uvicorn agricloud_forecast.main:app --host 127.0.0.1 --port 8000
pause
exit /b 0

:H5
cd /d "%ROOT%"
echo.
echo ========================================
echo   启动 H5 前端
echo ========================================

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 npm，请先安装 Node.js。
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo [提示] 根目录 node_modules 不存在，正在执行 npm install...
  call npm install
  if errorlevel 1 (
    echo [错误] 根目录 npm install 失败。
    pause
    exit /b 1
  )
)

call npm run dev:h5
pause
exit /b 0
