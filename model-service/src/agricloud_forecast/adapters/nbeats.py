"""N-BEATS adapter (ICLR 2020).

"N-BEATS: Neural basis expansion analysis for interpretable time series forecasting"
An interpretable, deep neural architecture based on backward and forward residual links.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

from .base import ModelAdapter, ModelAdapterError, ModelOutputBundle

WINDOW = 60
EPOCHS = 60
LEARNING_RATE = 2e-3
MC_SAMPLES = 30
DROPOUT = 0.1

class NBeatsAdapter(ModelAdapter):
    family = "nbeats"
    version = "iclr-2020-v1"

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

        class GenericBlock(nn.Module):
            def __init__(self, backcast_length, forecast_length, hidden_layer_units):
                super(GenericBlock, self).__init__()
                self.backcast_length = backcast_length
                self.forecast_length = forecast_length
                self.fc1 = nn.Linear(backcast_length, hidden_layer_units)
                self.fc2 = nn.Linear(hidden_layer_units, hidden_layer_units)
                self.fc3 = nn.Linear(hidden_layer_units, hidden_layer_units)
                self.fc4 = nn.Linear(hidden_layer_units, hidden_layer_units)
                
                self.backcast_linear = nn.Linear(hidden_layer_units, backcast_length)
                self.forecast_linear = nn.Linear(hidden_layer_units, forecast_length)
                self.dropout = nn.Dropout(DROPOUT)
                self.relu = nn.ReLU()

            def forward(self, x):
                x = self.relu(self.fc1(x))
                x = self.dropout(x)
                x = self.relu(self.fc2(x))
                x = self.dropout(x)
                x = self.relu(self.fc3(x))
                x = self.dropout(x)
                x = self.relu(self.fc4(x))
                
                theta_b = self.relu(self.backcast_linear(x))
                theta_f = self.forecast_linear(x)
                return theta_b, theta_f

        class NBeats(nn.Module):
            def __init__(self, seq_len):
                super(NBeats, self).__init__()
                self.seq_len = seq_len
                self.pred_len = 1
                self.block1 = GenericBlock(seq_len, self.pred_len, 64)
                self.block2 = GenericBlock(seq_len, self.pred_len, 64)
                self.block3 = GenericBlock(seq_len, self.pred_len, 64)

            def forward(self, backcast):
                # backcast: [Batch, seq_len]
                backcast_1, forecast_1 = self.block1(backcast)
                backcast = backcast - backcast_1
                backcast_2, forecast_2 = self.block2(backcast)
                backcast = backcast - backcast_2
                backcast_3, forecast_3 = self.block3(backcast)
                
                forecast = forecast_1 + forecast_2 + forecast_3
                return forecast.unsqueeze(-1)

        return NBeats(WINDOW)

    def fit(self, series: Sequence[float], missing_mask: Sequence[int], features: Sequence[Sequence[float]] | None = None) -> None:
        try:
            import torch
            import torch.nn as nn
            import torch.optim as optim
        except Exception as exc:
            raise ModelAdapterError(f"torch_unavailable: {exc}") from exc

        arr = np.asarray(list(series), dtype=np.float32)
        if arr.size < WINDOW + 2:
            raise ModelAdapterError(f"nbeats_history_too_short: have={arr.size} need>={WINDOW + 2}")

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._mean = float(arr.mean())
        self._std = float(arr.std(ddof=0)) or 1.0
        norm = (arr - self._mean) / self._std

        xs, ys = [], []
        for i in range(arr.size - WINDOW):
            xs.append(norm[i : i + WINDOW])
            ys.append(norm[i + WINDOW])
            
        x_tensor = self._to_tensor(np.asarray(xs))
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

    def predict(self, horizon: int, future_features: Sequence[Sequence[float]] | None = None) -> ModelOutputBundle:
        if self._model is None or self._series is None:
            raise ModelAdapterError("nbeats_not_fitted")
            
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
                    out = self._model(self._to_tensor(window).reshape(1, WINDOW))
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
