"""Prophet adapter (Facebook/Meta Prophet)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Sequence

import numpy as np
import pandas as pd

from .base import ModelAdapter, ModelAdapterError, ModelOutputBundle


class ProphetAdapter(ModelAdapter):
    family = "prophet"
    version = "v1-default-seasonal"

    def __init__(self) -> None:
        self._model80 = None
        self._model95 = None
        self._series_len = 0

    @property
    def kind(self) -> str:
        return "ml"

    def _build_df(self, series: Sequence[float]) -> pd.DataFrame:
        # Prophet wants ds + y. We synthesize daily timestamps ending today; the
        # adapter is invoked per-fit so the absolute date does not need to match
        # the upstream observed_date — only the relative pattern matters for the
        # forecast shape.
        n = len(series)
        end = date.today()
        rng = [end - timedelta(days=(n - 1 - i)) for i in range(n)]
        return pd.DataFrame({"ds": pd.to_datetime(rng), "y": list(series)})

    def fit(self, series: Sequence[float], missing_mask: Sequence[int]) -> None:
        try:
            from prophet import Prophet
        except Exception as exc:
            raise ModelAdapterError(f"prophet_unavailable: {exc}") from exc

        arr = list(series)
        if len(arr) < 10:
            raise ModelAdapterError(f"prophet_history_too_short: {len(arr)}")
        self._series_len = len(arr)

        df = self._build_df(arr)
        try:
            m80 = Prophet(interval_width=0.80, daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=False)
            m80.fit(df)
            m95 = Prophet(interval_width=0.95, daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=False)
            m95.fit(df)
        except Exception as exc:
            raise ModelAdapterError(f"prophet_fit_failed: {exc}") from exc
        self._model80 = m80
        self._model95 = m95

    def predict(self, horizon: int) -> ModelOutputBundle:
        if self._model80 is None or self._model95 is None:
            raise ModelAdapterError("prophet_not_fitted")
        try:
            future = self._model80.make_future_dataframe(periods=int(horizon))
            f80 = self._model80.predict(future).tail(int(horizon))
            f95 = self._model95.predict(future).tail(int(horizon))
        except Exception as exc:
            raise ModelAdapterError(f"prophet_forecast_failed: {exc}") from exc

        return ModelOutputBundle(
            point_estimates=[float(x) for x in f80["yhat"].values],
            ci80_lower=[float(x) for x in f80["yhat_lower"].values],
            ci80_upper=[float(x) for x in f80["yhat_upper"].values],
            ci95_lower=[float(x) for x in f95["yhat_lower"].values],
            ci95_upper=[float(x) for x in f95["yhat_upper"].values],
        )
