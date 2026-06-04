"""Model adapter package.

Concrete model families (ARIMA / Holt-Winters / Prophet / LSTM / ...) are
declared here in subsequent tasks (3.4.2 - 3.4.5). The base class lives in
``base.py`` and provides a common interface so the routes layer doesn't need
to special-case each family.
"""

from .base import ModelAdapter, ModelAdapterError, ModelOutputBundle

__all__ = ["ModelAdapter", "ModelAdapterError", "ModelOutputBundle"]
