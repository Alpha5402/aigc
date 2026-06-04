"""``/forecast`` and ``/forecast/batch`` routes.

Forecast_Engine sends a request shaped per :class:`ForecastRequest`. We fan out
to one adapter per requested family, run them in a thread pool (so the
CPU/GPU work doesn't block the asyncio loop), and return a
:class:`ForecastResponse`.

Per-family failures are logged on the response (``status='failed'``) but do not
fail the whole request — the Forecast_Engine on the Node.js side filters
successes and fuses them.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..adapters.base import ModelAdapter, ModelAdapterError
from ..registry import build_adapter
from ..schemas import (
    ForecastBatchRequest,
    ForecastBatchResponse,
    ForecastRequest,
    ForecastResponse,
    ModelOutput,
)

router = APIRouter()
logger = logging.getLogger("agricloud_forecast.routes.forecast")

INFERENCE_CONCURRENCY = int(os.getenv("MODEL_INFERENCE_CONCURRENCY", "4"))
_INFERENCE_SEM = asyncio.Semaphore(max(1, INFERENCE_CONCURRENCY))


async def _run_adapter(family: str, history_values: list[float], missing_mask: list[int], horizon: int, features: list[list[float]] | None = None, future_features: list[list[float]] | None = None) -> ModelOutput:
    adapter: Optional[ModelAdapter] = build_adapter(family)
    if adapter is None:
        return ModelOutput(
            family=family,
            version="unknown",
            status="failed",
            point_estimates=[None] * horizon,
            ci80_lower=[None] * horizon,
            ci80_upper=[None] * horizon,
            ci95_lower=[None] * horizon,
            ci95_upper=[None] * horizon,
            inference_ms=0,
            error_message="unknown_family",
        )

    started = time.perf_counter()
    try:
        await asyncio.to_thread(adapter.fit, history_values, missing_mask, features)
        bundle = await asyncio.to_thread(adapter.predict, horizon, future_features)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ModelOutput(
            family=adapter.family,
            version=adapter.version,
            status="success",
            point_estimates=bundle.point_estimates,
            ci80_lower=bundle.ci80_lower,
            ci80_upper=bundle.ci80_upper,
            ci95_lower=bundle.ci95_lower,
            ci95_upper=bundle.ci95_upper,
            inference_ms=elapsed_ms,
            error_message=None,
        )
    except ModelAdapterError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.warning("adapter %s failed: %s", family, exc)
        return ModelOutput(
            family=family,
            version=getattr(adapter, "version", "unknown"),
            status="failed",
            point_estimates=[None] * horizon,
            ci80_lower=[None] * horizon,
            ci80_upper=[None] * horizon,
            ci95_lower=[None] * horizon,
            ci95_upper=[None] * horizon,
            inference_ms=elapsed_ms,
            error_message=str(exc)[:240],
        )
    except Exception as exc:  # noqa: BLE001 - upstream sees as failed
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.exception("adapter %s crashed: %s", family, exc)
        return ModelOutput(
            family=family,
            version=getattr(adapter, "version", "unknown"),
            status="failed",
            point_estimates=[None] * horizon,
            ci80_lower=[None] * horizon,
            ci80_upper=[None] * horizon,
            ci95_lower=[None] * horizon,
            ci95_upper=[None] * horizon,
            inference_ms=elapsed_ms,
            error_message=f"adapter_crashed: {type(exc).__name__}",
        )


async def _forecast_one(req: ForecastRequest) -> ForecastResponse:
    history_values = [float(v) for v in req.history.forward_filled_values]
    missing_mask = [int(m) for m in req.history.missing_mask]
    features = req.history.features
    horizon = int(req.horizon_days)

    started = time.perf_counter()
    async with _INFERENCE_SEM:
        results = await asyncio.gather(
            *(
                _run_adapter(family, history_values, missing_mask, horizon, features)
                for family in req.families
            )
        )
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return ForecastResponse(
        request_id=req.request_id,
        spu_id=req.spu_id,
        horizon_days=req.horizon_days,
        models=results,
        total_inference_ms=elapsed_ms,
    )


@router.post("/forecast", response_model=ForecastResponse)
async def forecast(request: ForecastRequest) -> ForecastResponse:
    return await _forecast_one(request)


@router.post("/forecast/batch", response_model=ForecastBatchResponse)
async def forecast_batch(payload: ForecastBatchRequest) -> ForecastBatchResponse:
    if len(payload.items) > 50:
        raise HTTPException(status_code=400, detail="batch_size_exceeds_limit")
    results = await asyncio.gather(*(_forecast_one(item) for item in payload.items))
    return ForecastBatchResponse(items=results)
