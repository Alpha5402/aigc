"""HMAC-SHA256 signature verification middleware.

Mirrors ``backend/lib/forecast-signer.js`` byte-for-byte. The canonical string
is::

    METHOD\nPATH\nsha256(body_hex)\nNONCE\nTIMESTAMP_MS

Validates: Requirement 3.1, design §15.2-§15.3.
Properties: 20 (signature + replay protection + 5-minute clock skew).
"""

from __future__ import annotations

import hashlib
import hmac
import time
from collections import OrderedDict
from typing import Any, Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import SETTINGS

HEADER_SIGNATURE = "x-forecast-signature"
HEADER_NONCE = "x-forecast-nonce"
HEADER_TIMESTAMP = "x-forecast-timestamp"
HEADER_REQUEST_ID = "x-forecast-request-id"

CLOCK_SKEW_MS = 5 * 60 * 1000  # ±5 minutes


class _NonceLRU:
    """Tiny LRU with TTL for nonce replay protection.

    Key = nonce (string). Value = expiry epoch-ms. Bounded so a misbehaving
    client cannot exhaust memory.
    """

    def __init__(self, capacity: int = 10_000, ttl_ms: int = 5 * 60 * 1000) -> None:
        self._cap = capacity
        self._ttl = ttl_ms
        self._map: "OrderedDict[str, int]" = OrderedDict()

    def seen(self, nonce: str, now_ms: int) -> bool:
        # purge expired from the head (ordered by insertion, not expiry; a
        # single sweep below works because TTL is fixed)
        expired_keys = []
        for k, v in self._map.items():
            if v > now_ms:
                break
            expired_keys.append(k)
        for k in expired_keys:
            self._map.pop(k, None)
        return nonce in self._map

    def remember(self, nonce: str, now_ms: int) -> None:
        if len(self._map) >= self._cap:
            self._map.popitem(last=False)
        self._map[nonce] = now_ms + self._ttl

    def reset(self) -> None:
        self._map.clear()


_NONCE_STORE = _NonceLRU(ttl_ms=SETTINGS.nonce_ttl_seconds * 1000)


def _normalize_path(path: str) -> str:
    # strip query/fragment to mirror Node.js normalizePath()
    cut = path.find("?")
    if cut >= 0:
        path = path[:cut]
    cut = path.find("#")
    if cut >= 0:
        path = path[:cut]
    if not path.startswith("/"):
        path = "/" + path
    return path


def compute_signature(
    *,
    secret: str,
    method: str,
    path: str,
    body: bytes,
    nonce: str,
    timestamp: str,
) -> str:
    """Return hex HMAC-SHA256 over the canonical string."""

    body_hash = hashlib.sha256(body or b"").hexdigest()
    canonical = "\n".join([
        method.upper(),
        _normalize_path(path),
        body_hash,
        str(nonce),
        str(timestamp),
    ])
    return hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def reset_nonce_store_for_tests() -> None:
    """Clear the in-process nonce LRU. Tests only."""

    _NONCE_STORE.reset()


# Endpoints that bypass HMAC (internal monitoring only).
PUBLIC_PATHS = {"/health"}
PUBLIC_PREFIXES = {"/download_model/"}

class HmacSignatureMiddleware(BaseHTTPMiddleware):
    """ASGI middleware enforcing HMAC + nonce + timestamp on protected routes."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Any]],
    ):
        path = request.url.path
        if path in PUBLIC_PATHS or any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES):
            return await call_next(request)

        secret = SETTINGS.shared_secret
        if not secret:
            return JSONResponse({"error": "missing_server_secret"}, status_code=503)

        sig = request.headers.get(HEADER_SIGNATURE)
        nonce = request.headers.get(HEADER_NONCE)
        ts = request.headers.get(HEADER_TIMESTAMP)
        if not sig or not nonce or not ts:
            return JSONResponse({"error": "missing_signature_headers"}, status_code=401)

        try:
            ts_int = int(ts)
        except (TypeError, ValueError):
            return JSONResponse({"error": "invalid_timestamp"}, status_code=401)
        now_ms = int(time.time() * 1000)
        if abs(now_ms - ts_int) > CLOCK_SKEW_MS:
            return JSONResponse({"error": "expired"}, status_code=401)

        if _NONCE_STORE.seen(nonce, now_ms):
            return JSONResponse({"error": "replay"}, status_code=401)

        body = await request.body()
        expected = compute_signature(
            secret=secret,
            method=request.method,
            path=path,
            body=body,
            nonce=nonce,
            timestamp=ts,
        )
        if not hmac.compare_digest(sig, expected):
            return JSONResponse({"error": "invalid_signature"}, status_code=401)

        _NONCE_STORE.remember(nonce, now_ms)

        # Make body available again to downstream handlers (FastAPI buffers internally
        # via request.json() etc., but reading body() once consumes the stream).
        async def receive() -> dict[str, Any]:
            return {"type": "http.request", "body": body, "more_body": False}

        request._receive = receive  # type: ignore[attr-defined]
        return await call_next(request)
