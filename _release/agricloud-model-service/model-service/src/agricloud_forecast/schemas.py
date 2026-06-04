"""Pydantic v2 schemas mirroring the Node.js Forecast_Engine contract.

Validates: Requirement 3.2, 3.4 (request/response shape).
"""

from __future__ import annotations

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# Type aliases kept tight to spec.
RequestId = Annotated[str, Field(min_length=16, max_length=64)]
HorizonDays = Literal[7, 30]
ModelFamily = Literal[
    "moving_average",
    "simple_exp_smoothing",
    "holt_winters",
    "arima",
    "sarima",
    "prophet",
    "xgboost",
    "random_forest",
    "lstm",
    "gru",
    "transformer",
    "timemixer",
    "nbeats",
    "dlinear",
]


class HistoryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dates: list[str] = Field(min_length=1, max_length=1825)
    values: list[Optional[float]] = Field(min_length=1, max_length=1825)
    missing_mask: list[int] = Field(min_length=1, max_length=1825)
    forward_filled_values: list[float] = Field(min_length=1, max_length=1825)


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: RequestId
    spu_id: str = Field(min_length=1, max_length=64)
    horizon_days: HorizonDays
    families: list[ModelFamily] = Field(min_length=1, max_length=13)
    history: HistoryPayload


class ModelOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    family: ModelFamily
    version: str = Field(min_length=1, max_length=64)
    status: Literal["success", "failed"]
    point_estimates: list[Optional[float]]
    ci80_lower: list[Optional[float]]
    ci80_upper: list[Optional[float]]
    ci95_lower: list[Optional[float]]
    ci95_upper: list[Optional[float]]
    inference_ms: int
    error_message: Optional[str] = None


class ForecastResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: RequestId
    spu_id: str
    horizon_days: HorizonDays
    models: list[ModelOutput]
    total_inference_ms: int


class ForecastBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ForecastRequest] = Field(min_length=1, max_length=50)


class ForecastBatchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ForecastResponse]


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"]
    version: str
    log_level: str
    loaded_families: list[str] = Field(default_factory=list)
