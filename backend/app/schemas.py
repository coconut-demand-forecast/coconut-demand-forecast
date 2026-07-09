import datetime as dt
from typing import Optional, List, Literal

from pydantic import BaseModel, field_validator


class RegisterIn(BaseModel):
    name: str
    organization: str = "farmer"
    contact: str
    password: str


class LoginIn(BaseModel):
    contact: str
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    organization: str
    contact: str

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class DemandRecordIn(BaseModel):
    date: dt.date
    demand: float
    avg_price: Optional[float] = None
    cost_price: Optional[float] = None
    production_volume: Optional[float] = None
    season: Optional[str] = None
    is_holiday: bool = False
    avg_temp: Optional[float] = None
    rainfall: Optional[float] = None
    tourists: Optional[float] = None
    channel: Optional[str] = None
    has_promotion: bool = False
    note: Optional[str] = None


class DemandRecordOut(DemandRecordIn):
    id: int

    class Config:
        from_attributes = True


class UploadResult(BaseModel):
    rows_imported: int
    rows_skipped: int
    warnings: List[str] = []


class TrainRequest(BaseModel):
    models: List[Literal["random_forest", "xgboost", "lightgbm"]] = [
        "random_forest",
        "xgboost",
        "lightgbm",
    ]
    horizon_days: int = 30


class ModelMetrics(BaseModel):
    model_type: str
    mae: float
    rmse: float
    mape: float
    r2: float
    feature_importance: dict
    trained_at: dt.datetime

    class Config:
        from_attributes = True


class TrainResponse(BaseModel):
    results: List[ModelMetrics]
    best_model: str


class ForecastPoint(BaseModel):
    date: dt.date
    predicted: float
    lower: float
    upper: float


class ForecastResponse(BaseModel):
    model_type: str
    horizon_days: int
    points: List[ForecastPoint]
