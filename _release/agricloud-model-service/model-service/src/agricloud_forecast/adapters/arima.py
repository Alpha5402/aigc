"""ARIMA / SARIMAX adapter using statsmodels.

Validates: Requirement 3.3 (statistical family).
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

from .base import ModelAdapter, ModelAdapterError, ModelOutputBundle


class ArimaAdapter(ModelAdapter):
    family = "arima"
    version = "v1-grid-pdq"

    # Small grid; intentionally tiny to keep CPU runtime bounded for tests.
    _PDQ = [(1, 0, 0), (0, 1, 1), (1, 1, 1), (2, 1, 0)]

    def __init__(self) -> None:
        self._fit_result = None  # statsmodels SARIMAXResults

    @property
    def kind(self) -> str:
        return "statistical"

    def fit(self, series: Sequence[float], missing_mask: Sequence[int]) -> None:
        try:
            from statsmodels.tsa.statespace.sarimax import SARIMAX
        except Exception as exc:
            raise ModelAdapterError(f"statsmodels_unavailable: {exc}") from exc

        arr = np.asarray(list(series), dtype=float)
        if arr.size < 8:
            raise ModelAdapterError(f"arima_history_too_short: {arr.size}")

        best_aic = float("inf")
        best_fit = None
        last_error: Exception | None = None
        for order in self._PDQ:
            try:
                model = SARIMAX(
                    arr,
                    order=order,
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
                res = model.fit(disp=False, method="lbfgs", maxiter=50)
                if np.isfinite(res.aic) and res.aic < best_aic:
                    best_aic = res.aic
                    best_fit = res
            except Exception as exc:
                last_error = exc
                continue
        if best_fit is None:
            raise ModelAdapterError(f"arima_no_grid_converged: {last_error}")
        self._fit_result = best_fit

    def predict(self, horizon: int) -> ModelOutputBundle:
        if self._fit_result is None:
            raise ModelAdapterError("arima_not_fitted")
        try:
            forecast = self._fit_result.get_forecast(steps=int(horizon))
            mean = forecast.predicted_mean
            ci80 = forecast.conf_int(alpha=0.20)
            ci95 = forecast.conf_int(alpha=0.05)
        except Exception as exc:
            raise ModelAdapterError(f"arima_forecast_failed: {exc}") from exc

        # ci80 / ci95 may be DataFrame or ndarray depending on statsmodels version
        ci80_arr = np.asarray(ci80)
        ci95_arr = np.asarray(ci95)
        return ModelOutputBundle(
            point_estimates=[float(x) for x in np.asarray(mean)],
            ci80_lower=[float(x) for x in ci80_arr[:, 0]],
            ci80_upper=[float(x) for x in ci80_arr[:, 1]],
            ci95_lower=[float(x) for x in ci95_arr[:, 0]],
            ci95_upper=[float(x) for x in ci95_arr[:, 1]],
        )
