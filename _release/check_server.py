"""Check what's on the GPU server and list any trained model files."""
import paramiko, os, sys

HOST = "connect.nmb2.seetacloud.com"
PORT = 34335
USER = "root"
PASS = os.environ.get("AUTODL_PASSWORD") or "5EAVh7knbz6m"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS,
               timeout=30, allow_agent=False, look_for_keys=False)

def run(cmd):
    _, out, err = client.exec_command(f"bash -lc {repr(cmd)}")
    o = out.read().decode("utf-8", errors="replace")
    e = err.read().decode("utf-8", errors="replace")
    return o, e

print("=== disk usage ===")
o, _ = run("df -h /root/autodl-tmp 2>/dev/null || df -h /")
print(o)

print("=== autodl-tmp contents ===")
o, _ = run("ls -la /root/autodl-tmp/ 2>/dev/null || echo 'no autodl-tmp'")
print(o)

print("=== agricloud-forecast dir ===")
o, _ = run("ls -la /root/autodl-tmp/agricloud-forecast/ 2>/dev/null || echo 'not found'")
print(o)

print("=== model files ===")
o, _ = run("find /root/autodl-tmp /root -name '*.pt' -o -name '*.pkl' -o -name '*.onnx' -o -name '*.zip' 2>/dev/null | head -40")
print(o or "(none found)")

print("=== python / pip ===")
o, _ = run("python3 --version 2>&1; which python3")
print(o)

print("=== installed packages ===")
o, _ = run("pip list 2>/dev/null | grep -iE 'torch|statsmodels|prophet|fastapi|uvicorn' | head -20")
print(o or "(nothing relevant installed)")

print("=== running processes ===")
o, _ = run("ps aux | grep -E 'uvicorn|python' | grep -v grep | head -10")
print(o or "(no python processes)")

client.close()
print("=== done ===")
