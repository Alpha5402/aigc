"""Abstract base for all model adapters.

Validates: Requirement 3.3, 3.4 (Model_Service supports multiple families
and returns point + 80%/95% CI in a uniform shape).

Adapter contract:
    - ``family`` and ``version`` identify the model in registry / forecast_runs.
    - ``fit(series, missing_mask)`` trains/loads the model for a given SPU.
      ``series`` is forward-filled (no nulls); ``missing_mask`` aligns 1-to-1
      with ``series`` (1 = original missing, 0 = real observation).
    - ``predict(horizon)`` returns a :class:`ModelOutputBundle` whose vectors
      have length == horizon.

Implementations should be deterministic given the same inputs (or close to
deterministic for non-convex DL models — fix random seeds in the subclass).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Sequence


class ModelAdapterError(RuntimeError):
    """Raised when an adapter cannot fit or predict on the given input.

    Wrap third-party errors (statsmodels, prophet, torch) into this so the
    routes layer can record ``status='failed'`` without leaking implementation
    details to the Node.js Forecast_Engine.
    """


@dataclass(frozen=True)
class ModelOutputBundle:
    """Structured prediction emitted by a single adapter.

    Lists must all share the same length (== horizon). Use ``None`` for days
    that the model declines to predict; downstream Forecast_Engine maps that
    to JSON ``null`` (Requirement 4.6 / Property 12).
    """

    point_estimates: list[float | None]
    ci80_lower: list[float | None]
    ci80_upper: list[float | None]
    ci95_lower: list[float | None]
    ci95_upper: list[float | None]

    def __post_init__(self) -> None:
        n = len(self.point_estimates)
        for name in ("ci80_lower", "ci80_upper", "ci95_lower", "ci95_upper"):
            if len(getattr(self, name)) != n:
                raise ModelAdapterError(
                    f"output length mismatch: point={n} {name}={len(getattr(self, name))}"
                )


class ModelAdapter(ABC):
    """Abstract interface. Subclasses implement family-specific logic."""

    family: str  # set by subclass
    version: str  # set by subclass; ≤ 64 chars per design §3.4

    @abstractmethod
    def fit(self, series: Sequence[float], missing_mask: Sequence[int], features: Sequence[Sequence[float]] | None = None) -> None:
        """Train (or load) the model on the provided history.

        Implementations must not mutate ``series``; copy if necessary.
        Raise :class:`ModelAdapterError` for non-recoverable issues.
        """

    @abstractmethod
    def predict(self, horizon: int, future_features: Sequence[Sequence[float]] | None = None) -> ModelOutputBundle:
        """Generate a horizon-length forecast.

        ``horizon`` is the number of future days to predict. The returned
        bundle must satisfy CI monotonicity (95L ≤ 80L ≤ point ≤ 80U ≤ 95U)
        per Requirement 4.3; Forecast_Engine performs the final clip/check.
        """

    # Optional capability hint used by routes layer for dispatching.
    @property
    def kind(self) -> str:
        """Coarse category: ``'statistical' | 'ml' | 'deep'``.

        Override in subclasses; default to 'statistical' so that mistyped or
        untyped families behave conservatively.
        """

        return "statistical"
