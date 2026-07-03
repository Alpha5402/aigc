"""FastAPI entry point for Model_Service."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from .config import SETTINGS
from .routes.forecast import router as forecast_router
from .routes.health import router as health_router
from .security import HmacSignatureMiddleware

logging.basicConfig(level=SETTINGS.log_level)
logger = logging.getLogger("agricloud_forecast")

app = FastAPI(
    title="AgriCloud Forecast Model Service",
    version="0.1.0",
    description=(
        "Independent Python forecasting service for AgriCloudManager. "
        "See .kiro/specs/market-price-forecast/design.md §8 for design."
    ),
    docs_url=None,
    redoc_url=None,
)

# HMAC signature middleware applies to all routes except those whitelisted in
# ``security.PUBLIC_PATHS`` (currently only ``/health``).
app.add_middleware(HmacSignatureMiddleware)

app.include_router(health_router)
app.include_router(forecast_router)


@app.on_event("startup")
async def warm_up() -> None:
    logger.info(
        "agricloud_forecast starting up host=%s port=%s artifact_dir=%s",
        SETTINGS.host,
        SETTINGS.port,
        SETTINGS.artifact_dir,
    )
