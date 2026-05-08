#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-3002}"
HOST="0.0.0.0"

cd "$ROOT_DIR"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

get_lan_ip() {
  if command_exists ipconfig; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
  elif command_exists hostname; then
    hostname -I 2>/dev/null | awk '{print $1}' || true
  fi
}

if ! command_exists npm; then
  echo "错误：未找到 npm，请先安装 Node.js。"
  exit 1
fi

if ! command_exists python3; then
  echo "错误：未找到 python3，请先安装 Python 3。"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "未检测到 node_modules，正在安装前端依赖..."
  npm install
fi

python3 - <<'PY_CHECK'
try:
    import fastapi  # noqa: F401
    import uvicorn  # noqa: F401
except ModuleNotFoundError as exc:
    raise SystemExit(f"错误：Python 依赖缺失：{exc.name}。请先执行：python3 -m pip install fastapi uvicorn")
PY_CHECK

LAN_IP="$(get_lan_ip)"
if [ -z "$LAN_IP" ]; then
  LAN_IP="本机局域网IP"
fi

cleanup() {
  echo
  echo "正在停止前后端服务..."
  if [ -n "${FRONTEND_PID:-}" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "启动后端：http://$LAN_IP:$BACKEND_PORT"
python3 server/main.py &
BACKEND_PID=$!

echo "启动前端：http://$LAN_IP:$FRONTEND_PORT"
npm run dev -- --host "$HOST" --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

echo
echo "========================================"
echo "前端访问地址："
echo "  本机：http://localhost:$FRONTEND_PORT"
echo "  局域网：http://$LAN_IP:$FRONTEND_PORT"
echo
echo "后端 API："
echo "  本机：http://localhost:$BACKEND_PORT"
echo "  局域网：http://$LAN_IP:$BACKEND_PORT"
echo "========================================"
echo "按 Ctrl+C 停止所有服务。"

wait "$FRONTEND_PID" "$BACKEND_PID"
