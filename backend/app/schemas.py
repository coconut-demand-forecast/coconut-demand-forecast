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
    dry_run: bool
    rows_total: int
    rows_imported: int
    rows_skipped: int
    missing_value_rows: int = 0
    invalid_date_rows: int = 0
    invalid_demand_rows: int = 0
    negative_demand_rows: int = 0
    duplicate_date_rows: int = 0
    existing_rows_to_replace: int = 0
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
    train_size: Optional[int] = None
    test_size: Optional[int] = None
    mae: float
    rmse: float
    mape: float
    r2: float
    feature_importance: dict
    parameters: Optional[dict] = None
    hyperparameters_tuned: bool = False
    trained_at: dt.datetime

    class Config:
        from_attributes = True


class TrainResponse(BaseModel):
    results: List[ModelMetrics]
    best_model: str
    best_model_reason: str


class ForecastPoint(BaseModel):
    date: dt.date
    predicted: float
    lower: float
    upper: float


class ForecastSummary(BaseModel):
    mean: float
    max: float
    min: float
    trend: Literal["increasing", "decreasing", "flat"]
    trend_pct: float


class ForecastResponse(BaseModel):
    model_type: str
    horizon_days: int
    points: List[ForecastPoint]
    assumptions: str
    summary: ForecastSummary
    train_size: int
    test_size: int
    mae: float
    rmse: float
    mape: float
    r2: float
    trained_at: dt.datetime


class TestPredictionPoint(BaseModel):
    date: dt.date
    actual: float
    predicted: float
    error: float


class TestPredictionsResponse(BaseModel):
    model_type: str
    train_size: int
    test_size: int
    points: List[TestPredictionPoint]


class DataQualitySummary(BaseModel):
    count: int
    date_from: Optional[dt.date] = None
    date_to: Optional[dt.date] = None
    missing_value_rows: int = 0
    duplicate_date_rows: int = 0
    outlier_rows: int = 0
    usable_rows_for_training: int = 0
    min_raw_rows_required: int
    ready_for_training: bool
    reason: Optional[str] = None
