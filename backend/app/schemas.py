"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class Envelope(BaseModel):
    """Every success response: {"data": ..., "meta": {...}}."""
    data: Any
    meta: dict = Field(default_factory=dict)


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any = None


class ThresholdConfig(BaseModel):
    lower: float = Field(..., ge=-40, le=30)
    upper: float = Field(..., ge=-40, le=30)

    @model_validator(mode="after")
    def check_order(self):
        if self.lower >= self.upper:
            raise ValueError("lower limit must be below upper limit")
        return self


class ReadingIn(BaseModel):
    timestamp: datetime
    unit_id: str = Field(..., min_length=2, max_length=32)
    temperature_c: Optional[float] = Field(None, ge=-40, le=50)
    ambient_c: float = Field(..., ge=-20, le=60)
    door_state: Literal["open", "closed"]
    cooling_state: Literal["on", "off"]


class PredictionRequest(BaseModel):
    unit_id: str
    horizon_min: int = Field(30, ge=5, le=120)
    readings: Optional[list[ReadingIn]] = Field(None, description="Optional: score these readings instead of the stored series (oldest first, 1-minute spacing).")
    thresholds: Optional[ThresholdConfig] = None

    @field_validator("readings")
    @classmethod
    def enough_readings(cls, v):
        if v is not None and len(v) < 15:
            raise ValueError("at least 15 readings are needed to compute features")
        return v


class AlertPatch(BaseModel):
    status: Literal["acknowledged", "in_progress", "resolved", "dismissed"]
    note: Optional[str] = Field(None, max_length=2000)
    by: str = Field("Demo user", max_length=120)


class ActionIn(BaseModel):
    action: str = Field(..., min_length=3, max_length=200)
    note: Optional[str] = Field(None, max_length=2000)
    by: str = Field("Demo user", max_length=120)
    status: Literal["planned", "done"] = "planned"


class ScenarioRun(BaseModel):
    scenario: Literal["normal", "door", "degradation", "failure", "recovery"]
    minutes: int = Field(90, ge=10, le=240)
    ambient_c: float = Field(26, ge=10, le=40)
    initial_temp_c: float = Field(4.2, ge=0, le=10)
    upper: float = Field(8.0, ge=4, le=15)
    lower: float = Field(2.0, ge=-5, le=4)
    event_duration_min: int = Field(8, ge=1, le=120)
    horizon_min: int = Field(30, ge=5, le=120)
    include_series: bool = False

    @model_validator(mode="after")
    def check_limits(self):
        if self.lower >= self.upper:
            raise ValueError("lower limit must be below upper limit")
        return self
