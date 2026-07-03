"""End-to-end driver to deploy agricloud-model-service onto the AutoDL GPU instance.

Walks through §A–§G of the runbook:
    A) verify local tarball + sha256
    B) connect via SSH (paramiko)
    C) upload + extract + verify
    D) python env + pip install
    E) write .env with a freshly generated shared secret
    F) front-test uvicorn boots and /health responds
    G) start nohup background service

This script is idempotent — running it twice is safe; it skips work that's
already done. Output is streamed so you can see what's happening on the GPU
instance in real time.
"""

from __future__ import annotations

import hashlib
import os
import secrets
import sys
import time
from pathlib import Path
from typing import Iterable

import paramiko


SSH_HOST = "connect.nmb2.seetacloud.com"
SSH_PORT = 21746
SSH_USER = "root"
SSH_PASS = os.environ.get("AUTODL_PASSWORD") or "L3mIzbzCEENZ"

LOCAL_TARBALL = Path(__file__).resolve().parent / "agricloud-model-service.tar.gz"
EXPECTED_SHA256 = "2ba3154adcc5251580bf22f2f4f8524c1e0058d32cfddce0f6e7dc9b118e8339"

REMOTE_TMP = "/root/autodl-tmp"
REMOTE_TARBALL = f"{REMOTE_TMP}/agricloud-model-service.tar.gz"
REMOTE_BASE = f"{REMOTE_TMP}/agricloud-forecast"
REMOTE_SVC_DIR = f"{REMOTE_BASE}/model-service"
REMOTE_VENV = f"{REMOTE_SVC_DIR}/.venv"


# --- Console helpers -----------------------------------------------------

def section(title: str) -> None:
    bar = "=" * 70
    print(f"\n{bar}\n  {title}\n{bar}", flush=True)


def step(msg: str) -> None:
    print(f"\n[step] {msg}", flush=True)


def info(msg: str) -> None:
    print(f"  {msg}", flush=True)


def fail(msg: str) -> "NoReturn":  # type: ignore[name-defined]
    print(f"\n[FAIL] {msg}", flush=True)
    sys.exit(1)


# --- Local helpers -------------------------------------------------------

def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# --- SSH wrapper ---------------------------------------------------------

class Remote:
    def __init__(self, client: paramiko.SSHClient) -> None:
        self.client = client

    def run(
        self,
        cmd: str,
        *,
        timeout: int | None = 60,
        check: bool = True,
        stream: bool = False,
        bash_login: bool = True,
    ) -> tuple[int, str, str]:
        """Run a shell command on the remote, capturing/streaming output."""
        # Wrap in `bash -lc` so conda init / PATH from /root/.bashrc applies.
        wrapped = f"bash -lc {sh_quote(cmd)}" if bash_login else cmd
        info(f"$ {cmd}")
        chan = self.client.get_transport().open_session()
        chan.exec_command(wrapped)
        chan.settimeout(timeout)
        out_chunks: list[str] = []
        err_chunks: list[str] = []
        try:
            while True:
                if chan.recv_ready():
                    data = chan.recv(8192).decode("utf-8", errors="replace")
                    out_chunks.append(data)
                    if stream:
                        sys.stdout.write(data)
                        sys.stdout.flush()
                if chan.recv_stderr_ready():
                    data = chan.recv_stderr(8192).decode("utf-8", errors="replace")
                    err_chunks.append(data)
                    if stream:
                        sys.stderr.write(data)
                        sys.stderr.flush()
                if chan.exit_status_ready() and not chan.recv_ready() and not chan.recv_stderr_ready():
                    break
                time.sleep(0.05)
        except Exception as exc:  # noqa: BLE001
            chan.close()
            raise
        rc = chan.recv_exit_status()
        # drain any final bytes
        while chan.recv_ready():
            d = chan.recv(8192).decode("utf-8", errors="replace")
            out_chunks.append(d)
            if stream:
                sys.stdout.write(d)
                sys.stdout.flush()
        while chan.recv_stderr_ready():
            d = chan.recv_stderr(8192).decode("utf-8", errors="replace")
            err_chunks.append(d)
            if stream:
                sys.stderr.write(d)
                sys.stderr.flush()
        out = "".join(out_chunks)
        err = "".join(err_chunks)
        if check and rc != 0:
            print(f"\n  [!] exit={rc}", flush=True)
            if not stream:
                if out:
                    print("  --- stdout ---")
                    print(out)
                if err:
                    print("  --- stderr ---")
                    print(err)
            fail(f"command failed: {cmd}")
        return rc, out, err


def sh_quote(s: str) -> str:
    """Single-quote-escape a string for bash."""
    return "'" + s.replace("'", "'\\''") + "'"


def connect() -> paramiko.SSHClient:
    section("B) Establishing SSH connection")
    info(f"connecting to {SSH_USER}@{SSH_HOST}:{SSH_PORT}")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=SSH_HOST,
        port=SSH_PORT,
        username=SSH_USER,
        password=SSH_PASS,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    info("SSH session established")
    return client


# --- Stage drivers -------------------------------------------------------

def stage_a_local() -> None:
    section("A) Verify local tarball")
    if not LOCAL_TARBALL.exists():
        fail(f"missing tarball: {LOCAL_TARBALL}")
    h = sha256_of(LOCAL_TARBALL)
    info(f"sha256 = {h}")
    if h != EXPECTED_SHA256:
        fail(f"sha256 mismatch (expected {EXPECTED_SHA256})")
    info(f"size   = {LOCAL_TARBALL.stat().st_size} bytes")


def stage_c_upload(client: paramiko.SSHClient, remote: Remote) -> None:
    section("C) Upload + extract + verify")
    remote.run(f"mkdir -p {REMOTE_TMP} {REMOTE_BASE}")

    # Skip upload if already there & matching sha
    rc, out, _ = remote.run(
        f"sha256sum {REMOTE_TARBALL} 2>/dev/null || true",
        check=False,
    )
    needs_upload = True
    if out.strip().split() and out.strip().split()[0].lower() == EXPECTED_SHA256:
        info("remote tarball already present with matching sha256, skipping upload")
        needs_upload = False

    if needs_upload:
        sftp = client.open_sftp()
        info(f"uploading {LOCAL_TARBALL.name} via sftp...")

        def progress(transferred: int, total: int) -> None:
            if total:
                pct = transferred * 100 // total
                if transferred == total or pct % 25 == 0:
                    sys.stdout.write(f"\r  {transferred}/{total} ({pct}%)")
                    sys.stdout.flush()

        sftp.put(str(LOCAL_TARBALL), REMOTE_TARBALL, callback=progress)
        sftp.close()
        sys.stdout.write("\n")

    # Verify on remote
    _, out, _ = remote.run(f"sha256sum {REMOTE_TARBALL}")
    actual = out.strip().split()[0].lower()
    if actual != EXPECTED_SHA256:
        fail(f"remote sha256 mismatch: {actual}")
    info("sha256 verified on remote")

    # Extract (idempotent)
    remote.run(f"tar -xzf {REMOTE_TARBALL} -C {REMOTE_BASE}")
    rc, out, _ = remote.run(f"ls -la {REMOTE_BASE} | head -20")
    info(out.strip().splitlines()[-1] if out.strip() else "")


def stage_d_python_env(remote: Remote) -> None:
    section("D) Python env + pip install")

    # Probe python availability
    rc, py3_ver, _ = remote.run("python3 --version 2>&1 || true", check=False)
    info(f"system python3: {py3_ver.strip()}")
    rc, conda_path, _ = remote.run("command -v conda || true", check=False)
    have_conda = bool(conda_path.strip())
    info(f"conda available: {have_conda}")

    # Decide: prefer system python if it's >= 3.10; otherwise conda env
    use_conda = False
    if py3_ver.strip():
        # parse "Python 3.x.y"
        try:
            _, ver = py3_ver.strip().split(maxsplit=1)
            major, minor = (int(x) for x in ver.split(".")[:2])
            if (major, minor) < (3, 10):
                use_conda = True
        except Exception:  # noqa: BLE001
            use_conda = True
    else:
        use_conda = True

    if use_conda and not have_conda:
        fail("system python3 too old AND conda not available; cannot proceed")

    if use_conda:
        info("using a fresh conda env 'forecast' (python 3.11)")
        remote.run(
            "conda env list | grep -q '^forecast ' || conda create -n forecast python=3.11 -y",
            timeout=600,
            stream=True,
        )
        py = "/root/miniconda3/envs/forecast/bin/python"
        # autodl images put miniconda at different paths; resolve robustly
        rc, out, _ = remote.run(
            "conda run -n forecast which python", check=False
        )
        if out.strip():
            py = out.strip().splitlines()[-1]
        info(f"conda python = {py}")
    else:
        py = "python3"

    # Build venv with the chosen interpreter
    rc, _, _ = remote.run(f"test -d {REMOTE_VENV} || {py} -m venv {REMOTE_VENV}")
    info(f"venv ready at {REMOTE_VENV}")

    venv_pip = f"{REMOTE_VENV}/bin/pip"
    venv_py = f"{REMOTE_VENV}/bin/python"

    # Install dependencies (long-running; stream output)
    step("installing pip dependencies (this can take 5-15 min)")
    remote.run(
        f"{venv_pip} install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple",
        timeout=600,
        stream=True,
    )
    remote.run(
        f"cd {REMOTE_SVC_DIR} && {venv_pip} install -e '.[dev]' "
        f"-i https://pypi.tuna.tsinghua.edu.cn/simple",
        timeout=2400,  # 40 min cap; prophet build can be slow
        stream=True,
    )

    # Smoke import
    step("smoke import")
    remote.run(
        f"{venv_py} -c \""
        "import fastapi, statsmodels, prophet, torch; "
        "print('FastAPI', fastapi.__version__); "
        "print('statsmodels', statsmodels.__version__); "
        "print('prophet', prophet.__version__); "
        "print('torch', torch.__version__, 'cuda?', torch.cuda.is_available())"
        "\"",
        timeout=120,
        stream=True,
    )


def stage_e_env(remote: Remote) -> str:
    section("E) Configure .env")
    secret = secrets.token_hex(32)

    # Reuse existing secret if .env already exists, to avoid breaking ysngj.cn pairing
    rc, existing, _ = remote.run(
        f"test -f {REMOTE_SVC_DIR}/.env && grep ^FORECAST_SHARED_SECRET= {REMOTE_SVC_DIR}/.env || true",
        check=False,
    )
    if existing.strip().startswith("FORECAST_SHARED_SECRET=") and len(existing.split("=", 1)[1].strip()) >= 32:
        secret = existing.split("=", 1)[1].strip()
        info("reusing existing shared secret from .env")
    else:
        info("generated a new shared secret (64 hex chars)")

    env_text = "\n".join(
        [
            f"FORECAST_SHARED_SECRET={secret}",
            "FORECAST_NONCE_TTL_SECONDS=300",
            "MODEL_INFERENCE_CONCURRENCY=4",
            f"MODEL_ARTIFACT_DIR={REMOTE_BASE}/artifacts",
            "LOG_LEVEL=INFO",
            "HOST=0.0.0.0",
            "PORT=8000",
            "",
        ]
    )
    quoted = sh_quote(env_text)
    remote.run(f"printf %s {quoted} > {REMOTE_SVC_DIR}/.env && chmod 600 {REMOTE_SVC_DIR}/.env")
    remote.run(f"mkdir -p {REMOTE_BASE}/artifacts")
    info(".env written; permissions 600")
    return secret


def stage_f_health(remote: Remote) -> None:
    section("F) Foreground uvicorn boot test")
    venv_py = f"{REMOTE_VENV}/bin/python"
    remote.run(
        f"cd {REMOTE_SVC_DIR} && set -a && . ./.env && set +a && "
        f"timeout 25 {venv_py} -m uvicorn agricloud_forecast.main:app "
        f"--host 127.0.0.1 --port 18000 &"
        "  sleep 8;"
        f"  curl -fsS http://127.0.0.1:18000/health || (echo HEALTH_FAIL && exit 1);"
        "  echo;"
        f"  pkill -f 'agricloud_forecast.main:app --host 127.0.0.1 --port 18000' || true",
        timeout=60,
        stream=True,
    )


def stage_g_nohup(remote: Remote) -> None:
    section("G) nohup background service")
    pid_file = f"{REMOTE_BASE}/forecast.pid"
    out_log = f"{REMOTE_BASE}/forecast.out.log"
    err_log = f"{REMOTE_BASE}/forecast.err.log"
    venv_py = f"{REMOTE_VENV}/bin/python"

    # Stop previous instance if present
    remote.run(
        f"if [ -f {pid_file} ] && kill -0 $(cat {pid_file}) 2>/dev/null; then "
        f"  echo stopping old pid $(cat {pid_file}); kill $(cat {pid_file}); sleep 2; fi || true",
        check=False,
    )

    # Start new instance
    remote.run(
        f"cd {REMOTE_SVC_DIR} && nohup bash -c 'set -a; . ./.env; set +a; "
        f"exec {venv_py} -m uvicorn agricloud_forecast.main:app --host 0.0.0.0 --port 8000' "
        f"> {out_log} 2> {err_log} & echo $! > {pid_file}",
    )
    remote.run(f"sleep 3 && ps -p $(cat {pid_file}) -o pid,cmd | head -3")

    # Verify with internal curl (port 8000 internal — works regardless of AutoDL exposure)
    remote.run("curl -fsS http://127.0.0.1:8000/health && echo")

    info(f"service pid file: {pid_file}")
    info(f"stdout log:        {out_log}")
    info(f"stderr log:        {err_log}")


# --- Main ----------------------------------------------------------------

def main() -> None:
    stage_a_local()
    client = connect()
    try:
        remote = Remote(client)
        stage_c_upload(client, remote)
        stage_d_python_env(remote)
        secret = stage_e_env(remote)
        stage_f_health(remote)
        stage_g_nohup(remote)

        section("DONE")
        print("✅ Model_Service is running on the GPU instance (port 8000).", flush=True)
        print("\nNext steps for ysngj.cn backend pairing:", flush=True)
        print("  MODEL_SERVICE_BASE_URL = <AutoDL custom-service URL>", flush=True)
        print(f"  MODEL_SERVICE_SHARED_SECRET = {secret}", flush=True)
        print(
            "\nAutoDL console: add a custom-service mapping for container port 8000 "
            "to get the public https URL.",
            flush=True,
        )
    finally:
        client.close()


if __name__ == "__main__":
    main()
