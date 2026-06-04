"""Public ``/health`` endpoint (HMAC bypass)."""

from __future__ import annotations

from fastapi import APIRouter

from ..config import SETTINGS
from ..registry import known_families
from ..schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version="0.1.0",
        log_level=SETTINGS.log_level,
        loaded_families=known_families(),
    )
