"""LSTM adapter (PyTorch).

Lightweight per-SPU LSTM fine-tune. Designed to run on CPU within ~30 s for
small histories; scales to GPU when available without code change.

The CI is approximated via Monte-Carlo dropout (dropout layers stay active
at predict time; we sample N forward passes and take quantiles).
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np

from .base import ModelAdapter, ModelAdapterError, ModelOutputBundle


WINDOW = 28
HIDDEN = 64
NUM_LAYERS = 2
DROPOUT = 0.1
EPOCHS = 60
LEARNING_RATE = 1e-3
MC_SAMPLES = 30


class LstmAdapter(ModelAdapter):
    family = "lstm"
    version = "v1-h64-l2-w28"

    def __init__(self) -> None:
        self._model = None
        self._mean = 0.0
        self._std = 1.0
        self._device = "cpu"
        self._series = None  # cached for autoregressive predict

    @property
    def kind(self) -> str:
        return "deep"

    def _to_tensor(self, x):
        import torch

        return torch.tensor(x, dtype=torch.float32, device=self._device)

    def _build_model(self):
        import torch
        import torch.nn as nn

        class Net(nn.Module):
            def __init__(self):
                super().__init__()
                self.lstm = nn.LSTM(
                    input_size=1,
                    hidden_size=HIDDEN,
                    num_layers=NUM_LAYERS,
                    batch_first=True,
                    dropout=DROPOUT,
                )
                self.head = nn.Linear(HIDDEN, 1)
                self.dropout = nn.Dropout(DROPOUT)

            def forward(self, x):
                out, _ = self.lstm(x)
                last = out[:, -1, :]
                last = self.dropout(last)
                return self.head(last)

        return Net()

    def fit(self, series: Sequence[float], missing_mask: Sequence[int]) -> None:
        try:
            import torch
            import torch.nn as nn
            import torch.optim as optim
        except Exception as exc:
            raise ModelAdapterError(f"torch_unavailable: {exc}") from exc

        arr = np.asarray(list(series), dtype=np.float32)
        if arr.size < WINDOW + 2:
            raise ModelAdapterError(f"lstm_history_too_short: have={arr.size} need>={WINDOW + 2}")

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        # standardize
        self._mean = float(arr.mean())
        self._std = float(arr.std(ddof=0)) or 1.0
        norm = (arr - self._mean) / self._std

        # build sliding windows
        xs = []
        ys = []
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

    def predict(self, horizon: int) -> ModelOutputBundle:
        if self._model is None or self._series is None:
            raise ModelAdapterError("lstm_not_fitted")
        try:
            import torch
        except Exception as exc:
            raise ModelAdapterError(f"torch_unavailable: {exc}") from exc

        # Monte-Carlo dropout: keep model in train mode for stochastic forward passes
        self._model.train()
        all_paths: list[list[float]] = []
        for _ in range(MC_SAMPLES):
            seq = list(self._series[-WINDOW:])
            preds: list[float] = []
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
