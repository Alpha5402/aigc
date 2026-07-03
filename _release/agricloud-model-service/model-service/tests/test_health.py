"""Smoke test: GET /health returns 200 without HMAC."""

from __future__ import annotations

from fastapi.testclient import TestClient

from agricloud_forecast.main import app


def test_health_returns_ok() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"


def test_schemas_import() -> None:
    from agricloud_forecast.schemas import (
        ForecastRequest,
        HistoryPayload,
    )

    payload = ForecastRequest(
        request_id="r" * 20,
        spu_id="spu_test",
        horizon_days=7,
        families=["arima"],
        history=HistoryPayload(
            dates=["2026-01-01"],
            values=[4.5],
            missing_mask=[0],
            forward_filled_values=[4.5],
        ),
    )
    assert payload.spu_id == "spu_test"
