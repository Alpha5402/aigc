"""Adapter registry.

Only two families are active:
  - dlinear  : trend/seasonality decomposition (AAAI 2023), the "experienced farmer"
  - nbeats   : residual neural blocks (ICLR 2020), the "sharp trader"

Both require ≥ 62 days of history. Below that threshold the Node.js
Fallback_Engine (MA / SES) handles prediction without calling this service.
"""

from __future__ import annotations

from typing import Callable, Optional

from .adapters import ModelAdapter


_FACTORIES: dict[str, Callable[[], ModelAdapter]] = {}


def _register(name: str, factory: Callable[[], ModelAdapter]) -> None:
    _FACTORIES[name] = factory


def _dlinear_factory() -> ModelAdapter:
    from .adapters.dlinear import DLinearAdapter
    return DLinearAdapter()


def _nbeats_factory() -> ModelAdapter:
    from .adapters.nbeats import NBeatsAdapter
    return NBeatsAdapter()


_register("dlinear", _dlinear_factory)
_register("nbeats", _nbeats_factory)


def build_adapter(family: str) -> Optional[ModelAdapter]:
    """Return a fresh adapter instance or None if the family is unknown."""
    factory = _FACTORIES.get(family)
    if factory is None:
        return None
    return factory()


def known_families() -> list[str]:
    return sorted(_FACTORIES.keys())
