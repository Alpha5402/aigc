"""FastAPI entry point for Model_Service.

Active algorithms:
  - DLinear  (AAAI 2023) — trend/seasonality decomposition
  - N-BEATS  (ICLR 2020) — neural basis expansion

Triggered when a commodity has ≥ 62 days of price history.
Below that threshold the Node.js Fallback_Engine (MA / SES) is used instead.
"""

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
    version="0.2.0",
    description="DLinear + N-BEATS price forecasting for AgriCloudManager.",
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(HmacSignatureMiddleware)

app.include_router(health_router)
app.include_router(forecast_router)


@app.on_event("startup")
async def warm_up() -> None:
    logger.info(
        "agricloud_forecast starting up host=%s port=%s families=dlinear,nbeats",
        SETTINGS.host,
        SETTINGS.port,
    )
