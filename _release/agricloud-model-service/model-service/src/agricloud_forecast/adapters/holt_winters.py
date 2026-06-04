"""Holt-Winters additive seasonal smoothing (statsmodels)."""

from __future__ import annotations

from typing import Sequence

import numpy as np

from .base import ModelAdapter, ModelAdapterError, ModelOutputBundle


class HoltWintersAdapter(ModelAdapter):
    family = "holt_winters"
    version = "v1-additive-7"
    season_periods = 7

    def __init__(self) -> None:
        self._fitted = None
        self._residual_std = 0.0

    @property
    def kind(self) -> str:
        return "statistical"

    def fit(self, series: Sequence[float], missing_mask: Sequence[int]) -> None:
        try:
            from statsmodels.tsa.holtwinters import ExponentialSmoothing
        except Exception as exc:
            raise ModelAdapterError(f"statsmodels_unavailable: {exc}") from exc

        arr = np.asarray(list(series), dtype=float)
        if arr.size < self.season_periods * 2 + 2:
            raise ModelAdapterError(
                f"holt_winters_history_too_short: have={arr.size} need>={self.season_periods * 2 + 2}"
            )
        try:
            model = ExponentialSmoothing(
                arr,
                trend="add",
                seasonal="add",
                seasonal_periods=self.season_periods,
                initialization_method="estimated",
            )
            fit_result = model.fit(optimized=True, use_brute=True)
            self._fitted = fit_result
            residuals = arr - fit_result.fittedvalues
            self._residual_std = float(np.std(residuals, ddof=1)) if residuals.size > 1 else 0.0
        except Exception as exc:
            raise ModelAdapterError(f"holt_winters_fit_failed: {exc}") from exc

    def predict(self, horizon: int) -> ModelOutputBundle:
        if self._fitted is None:
            raise ModelAdapterError("holt_winters_not_fitted")
        try:
            point = self._fitted.forecast(int(horizon))
        except Exception as exc:
            raise ModelAdapterError(f"holt_winters_forecast_failed: {exc}") from exc

        z80 = 1.282
        z95 = 1.96
        margin80 = z80 * self._residual_std
        margin95 = z95 * self._residual_std
        point_list = [float(p) for p in point]
        return ModelOutputBundle(
            point_estimates=point_list,
            ci80_lower=[p - margin80 for p in point_list],
            ci80_upper=[p + margin80 for p in point_list],
            ci95_lower=[p - margin95 for p in point_list],
            ci95_upper=[p + margin95 for p in point_list],
        )
