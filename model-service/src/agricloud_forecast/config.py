"""Runtime configuration for Model_Service.

Environment variables are loaded eagerly so that subsequent imports observe a
stable view. `python-dotenv` reads `.env` if present.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional in production
    pass


@dataclass(frozen=True)
class Settings:
    """Strongly-typed runtime settings."""

    shared_secret: str
    nonce_ttl_seconds: int
    inference_concurrency: int
    artifact_dir: Path
    log_level: str
    host: str
    port: int

    @classmethod
    def from_env(cls) -> "Settings":
        secret = os.getenv("FORECAST_SHARED_SECRET", "").strip()
        return cls(
            shared_secret=secret,
            nonce_ttl_seconds=int(os.getenv("FORECAST_NONCE_TTL_SECONDS", "300")),
            inference_concurrency=int(os.getenv("MODEL_INFERENCE_CONCURRENCY", "4")),
            artifact_dir=Path(os.getenv("MODEL_ARTIFACT_DIR", "./artifacts")).resolve(),
            log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
            host=os.getenv("HOST", "127.0.0.1"),
            port=int(os.getenv("PORT", "8000")),
        )


# Single import-time settings snapshot
SETTINGS = Settings.from_env()
