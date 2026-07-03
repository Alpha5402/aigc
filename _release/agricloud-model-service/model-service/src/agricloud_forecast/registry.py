"""Adapter registry: maps a model family name to a factory.

Adapters are instantiated lazily on demand because some heavy imports
(``torch`` / ``prophet`` / ``statsmodels``) take seconds to load and we don't
want them to delay the import of the FastAPI app.

Each call to ``build_adapter`` returns a fresh instance — adapters are
stateful (they hold ``_fitted`` weights) and are not safe to share across
requests for different SPUs.
"""

from __future__ import annotations

from typing import Callable, Optional

from .adapters import ModelAdapter


_FACTORIES: dict[str, Callable[[], ModelAdapter]] = {}


def _register(name: str, factory: Callable[[], ModelAdapter]) -> None:
    _FACTORIES[name] = factory


def _holt_winters_factory() -> ModelAdapter:
    from .adapters.holt_winters import HoltWintersAdapter

    return HoltWintersAdapter()


def _arima_factory() -> ModelAdapter:
    from .adapters.arima import ArimaAdapter

    return ArimaAdapter()


def _prophet_factory() -> ModelAdapter:
    from .adapters.prophet_adapter import ProphetAdapter

    return ProphetAdapter()


def _lstm_factory() -> ModelAdapter:
    from .adapters.lstm import LstmAdapter

    return LstmAdapter()


_register("holt_winters", _holt_winters_factory)
_register("arima", _arima_factory)
_register("sarima", _arima_factory)  # alias
_register("prophet", _prophet_factory)
_register("lstm", _lstm_factory)


def build_adapter(family: str) -> Optional[ModelAdapter]:
    """Return a fresh adapter for the requested family or ``None`` if unknown.

    Phase 1 only ships 4 families (ARIMA / Holt-Winters / Prophet / LSTM);
    additional families register themselves here in subsequent phases.
    """

    factory = _FACTORIES.get(family)
    if factory is None:
        return None
    return factory()


def known_families() -> list[str]:
    return sorted(_FACTORIES.keys())
