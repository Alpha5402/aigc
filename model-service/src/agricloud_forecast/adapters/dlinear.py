"""DLinear adapter (AAAI 2023).

"Are Transformers Effective for Time Series Forecasting?" (AAAI 2023)
DLinear decomposes time series into trend and remainder (seasonal) components,
then applies a single linear layer to each. It is extremely fast, lightweight,
and frequently outperforms complex Transformers on standard benchmarks.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

from .base import ModelAdapter, ModelAdapterError, ModelOutputBundle

WINDOW = 60
EPOCHS = 80
LEARNING_RATE = 5e-3
MC_SAMPLES = 30
DROPOUT = 0.1

class DLinearAdapter(ModelAdapter):
    family = "dlinear"
    version = "aaai-2023-v1"

    def __init__(self) -> None:
        self._model = None
        self._mean = 0.0
        self._std = 1.0
        self._device = "cpu"
        self._series = None

    @property
    def kind(self) -> str:
        return "deep"

    def _to_tensor(self, x):
        import torch
        return torch.tensor(x, dtype=torch.float32, device=self._device)

    def _build_model(self):
        import torch
        import torch.nn as nn

        class moving_avg(nn.Module):
            def __init__(self, kernel_size, stride):
                super(moving_avg, self).__init__()
                self.kernel_size = kernel_size
                self.avg = nn.AvgPool1d(kernel_size=kernel_size, stride=stride, padding=0)

            def forward(self, x):
                # padding on the both ends of time series
                front = x[:, 0:1, :].repeat(1, (self.kernel_size - 1) // 2, 1)
                end = x[:, -1:, :].repeat(1, (self.kernel_size - 1) // 2, 1)
                x = torch.cat([front, x, end], dim=1)
                x = self.avg(x.permute(0, 2, 1))
                x = x.permute(0, 2, 1)
                return x

        class series_decomp(nn.Module):
            def __init__(self, kernel_size):
                super(series_decomp, self).__init__()
                self.moving_avg = moving_avg(kernel_size, stride=1)

            def forward(self, x):
                moving_mean = self.moving_avg(x)
                res = x - moving_mean
                return res, moving_mean

        class DLinear(nn.Module):
            def __init__(self, seq_len):
                super(DLinear, self).__init__()
                self.seq_len = seq_len
                self.pred_len = 1
                kernel_size = 25
                self.decomp = series_decomp(kernel_size)
                self.Linear_Seasonal = nn.Linear(self.seq_len, self.pred_len)
                self.Linear_Trend = nn.Linear(self.seq_len, self.pred_len)
                self.dropout = nn.Dropout(DROPOUT)

            def forward(self, x):
                seasonal_init, trend_init = self.decomp(x)
                seasonal_init = self.dropout(seasonal_init)
                trend_init = self.dropout(trend_init)
                
                seasonal_output = self.Linear_Seasonal(seasonal_init.squeeze(-1))
                trend_output = self.Linear_Trend(trend_init.squeeze(-1))
                
                x = seasonal_output + trend_output
                return x.unsqueeze(-1)

        return DLinear(WINDOW)

    def fit(self, series: Sequence[float], missing_mask: Sequence[int], features: Sequence[Sequence[float]] | None = None) -> None:
        try:
            import torch
            import torch.nn as nn
            import torch.optim as optim
        except Exception as exc:
            raise ModelAdapterError(f"torch_unavailable: {exc}") from exc

        arr = np.asarray(list(series), dtype=np.float32)
        if arr.size < WINDOW + 2:
            raise ModelAdapterError(f"dlinear_history_too_short: have={arr.size} need>={WINDOW + 2}")

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._mean = float(arr.mean())
        self._std = float(arr.std(ddof=0)) or 1.0
        norm = (arr - self._mean) / self._std

        xs, ys = [], []
        for i in range(arr.size - WINDOW):
            xs.append(norm[i : i + WINDOW])
            ys.append(norm[i + WINDOW])
            
        x_tensor = self._to_tensor(np.asarray(xs)).unsqueeze(-1)
        y_tensor = self._to_tensor(np.asarray(ys)).unsqueeze(-1)

        model = self._build_model().to(self._device)
        opt = optim.Adam(model.parameters(), lr=LEARNING_RATE)
        loss_fn = nn.MSELoss()

        model.train()
        for _ in range(EPOCHS):
            opt.zero_grad()
            pred = model(x_tensor)
            loss = loss_fn(pred, y_tensor)
            loss.backward()
            opt.step()

        self._model = model
        self._series = arr.tolist()

    def export_onnx(self, export_path: str) -> None:
        if self._model is None:
            raise ModelAdapterError("dlinear_not_fitted")
        import torch
        self._model.eval()
        dummy_input = torch.randn(1, WINDOW, 1).to(self._device)
        torch.onnx.export(
            self._model,
            dummy_input,
            export_path,
            export_params=True,
            opset_version=11,
            do_constant_folding=True,
            input_names=["input"],
            output_names=["output"],
            dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}}
        )

    def predict(self, horizon: int, future_features: Sequence[Sequence[float]] | None = None) -> ModelOutputBundle:
        if self._model is None or self._series is None:
            raise ModelAdapterError("dlinear_not_fitted")
            
        try:
            import torch
        except Exception as exc:
            raise ModelAdapterError(f"torch_unavailable: {exc}") from exc

        self._model.train()
        all_paths = []
        for _ in range(MC_SAMPLES):
            seq = list(self._series[-WINDOW:])
            preds = []
            for _step in range(int(horizon)):
                window = (np.asarray(seq[-WINDOW:], dtype=np.float32) - self._mean) / self._std
                with torch.no_grad():
                    out = self._model(self._to_tensor(window).reshape(1, WINDOW, 1))
                next_norm = float(out.detach().cpu().numpy().reshape(-1)[0])
                next_real = next_norm * self._std + self._mean
                preds.append(next_real)
                seq.append(next_real)
            all_paths.append(preds)

        arr = np.asarray(all_paths)
        point = arr.mean(axis=0)
        q10 = np.quantile(arr, 0.10, axis=0)
        q90 = np.quantile(arr, 0.90, axis=0)
        q025 = np.quantile(arr, 0.025, axis=0)
        q975 = np.quantile(arr, 0.975, axis=0)

        return ModelOutputBundle(
            point_estimates=[float(x) for x in point],
            ci80_lower=[float(x) for x in q10],
            ci80_upper=[float(x) for x in q90],
            ci95_lower=[float(x) for x in q025],
            ci95_upper=[float(x) for x in q975],
        )
