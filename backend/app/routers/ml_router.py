import csv
import datetime as dt
import io

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.ml.cache import get_trained, set_trained
from app.ml.forecast import ASSUMPTIONS_TEXT, generate_forecast
from app.ml.pipeline import rank_key, train_and_evaluate
from app.models import TrainingRun, User
from app.records import load_records_df
from app.schemas import (
    ForecastPoint,
    ForecastResponse,
    ForecastSummary,
    ModelMetrics,
    TestPredictionPoint,
    TestPredictionsResponse,
    TrainRequest,
    TrainResponse,
)

router = APIRouter(prefix="/api/ml", tags=["ml"])

MODEL_LABELS = {
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
    "lightgbm": "LightGBM",
}


def _train_one(db: Session, user: User, model_type: str, horizon_days: int) -> tuple[TrainingRun, dict]:
    df = load_records_df(db, user.id)
    if df.empty:
        raise HTTPException(status_code=400, detail="ยังไม่มีข้อมูล กรุณาอัปโหลดหรือโหลดข้อมูลตัวอย่างก่อน")

    try:
        result = train_and_evaluate(df, model_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    set_trained(
        user.id,
        model_type,
        {
            "model": result["model"],
            "feature_cols": result["feature_cols"],
            "residual_std": result["residual_std"],
            "records_df": df,
            "test_predictions": result["test_predictions"],
            "train_size": result["train_size"],
            "test_size": result["test_size"],
        },
    )

    run = TrainingRun(
        owner_id=user.id,
        model_type=model_type,
        horizon_days=horizon_days,
        train_size=result["train_size"],
        test_size=result["test_size"],
        mae=result["mae"],
        rmse=result["rmse"],
        mape=result["mape"],
        r2=result["r2"],
        feature_importance=result["feature_importance"],
        residual_std=result["residual_std"],
        parameters=result["parameters"],
        hyperparameters_tuned=result["hyperparameters_tuned"],
        assumptions_for_future_features=ASSUMPTIONS_TEXT,
        trained_at=dt.datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run, result


def _best_model_reason(best: TrainingRun, runs: list[TrainingRun]) -> str:
    name = MODEL_LABELS.get(best.model_type, best.model_type)
    others_close = [
        r for r in runs if r.model_type != best.model_type and round(r.mape, 1) == round(best.mape, 1)
    ]
    if others_close:
        return (
            f"{name} มีค่า MAPE ต่ำที่สุดที่ {best.mape:.1f}% (ใกล้เคียงกับโมเดลอื่น จึงใช้ RMSE รองลงมา "
            f"ที่ {best.rmse:.1f} เป็นเกณฑ์ตัดสิน) จึงถูกเลือกเป็นโมเดลที่มีประสิทธิภาพสูงสุด"
        )
    return f"{name} มีค่า MAPE ต่ำที่สุดที่ {best.mape:.1f}% จึงถูกเลือกเป็นโมเดลที่มีประสิทธิภาพสูงสุด"


@router.post("/train", response_model=TrainResponse)
def train(
    payload: TrainRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    runs = [_train_one(db, current_user, model_type, payload.horizon_days)[0] for model_type in payload.models]
    best = min(runs, key=rank_key)
    return TrainResponse(
        results=[ModelMetrics.model_validate(r) for r in runs],
        best_model=best.model_type,
        best_model_reason=_best_model_reason(best, runs),
    )


@router.get("/compare", response_model=TrainResponse)
def compare(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    latest_runs = []
    for model_type in MODEL_LABELS:
        run = (
            db.query(TrainingRun)
            .filter(TrainingRun.owner_id == current_user.id, TrainingRun.model_type == model_type)
            .order_by(TrainingRun.trained_at.desc())
            .first()
        )
        if run:
            latest_runs.append(run)

    if not latest_runs:
        raise HTTPException(status_code=404, detail="ยังไม่มีการเทรนโมเดล")

    best = min(latest_runs, key=rank_key)
    return TrainResponse(
        results=[ModelMetrics.model_validate(r) for r in latest_runs],
        best_model=best.model_type,
        best_model_reason=_best_model_reason(best, latest_runs),
    )


def _forecast_summary(points: list[dict]) -> ForecastSummary:
    values = np.array([p["predicted"] for p in points], dtype=float)
    mean_v, max_v, min_v = float(values.mean()), float(values.max()), float(values.min())
    half = max(len(values) // 2, 1)
    first_half_avg = float(values[:half].mean())
    second_half_avg = float(values[-half:].mean())
    trend_pct = round(((second_half_avg - first_half_avg) / first_half_avg * 100), 1) if first_half_avg else 0.0
    if trend_pct > 1:
        trend = "increasing"
    elif trend_pct < -1:
        trend = "decreasing"
    else:
        trend = "flat"
    return ForecastSummary(
        mean=round(mean_v, 1), max=round(max_v, 1), min=round(min_v, 1), trend=trend, trend_pct=trend_pct
    )


@router.get("/forecast", response_model=ForecastResponse)
def forecast(
    model: str = Query(default="xgboost"),
    horizon_days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if model not in MODEL_LABELS:
        raise HTTPException(status_code=400, detail=f"ไม่รู้จักโมเดล: {model}")

    cached = get_trained(current_user.id, model)
    latest_run = None
    if cached is None:
        latest_run, _ = _train_one(db, current_user, model, horizon_days)
        cached = get_trained(current_user.id, model)
    else:
        latest_run = (
            db.query(TrainingRun)
            .filter(TrainingRun.owner_id == current_user.id, TrainingRun.model_type == model)
            .order_by(TrainingRun.trained_at.desc())
            .first()
        )

    points = generate_forecast(
        cached["records_df"],
        cached["model"],
        cached["feature_cols"],
        horizon_days,
        cached["residual_std"],
    )
    return ForecastResponse(
        model_type=model,
        horizon_days=horizon_days,
        points=[ForecastPoint(**p) for p in points],
        assumptions=ASSUMPTIONS_TEXT,
        summary=_forecast_summary(points),
        train_size=latest_run.train_size or cached.get("train_size", 0),
        test_size=latest_run.test_size or cached.get("test_size", 0),
        mae=latest_run.mae,
        rmse=latest_run.rmse,
        mape=latest_run.mape,
        r2=latest_run.r2,
        trained_at=latest_run.trained_at,
    )


@router.get("/test-predictions", response_model=TestPredictionsResponse)
def test_predictions(
    model: str = Query(default="xgboost"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Actual vs predicted values on the held-out TEST set only — this is
    backtesting evidence of model accuracy, distinct from the future
    forecast (see /forecast). Never mix the two on one chart without
    labeling them separately."""
    if model not in MODEL_LABELS:
        raise HTTPException(status_code=400, detail=f"ไม่รู้จักโมเดล: {model}")

    cached = get_trained(current_user.id, model)
    if cached is None:
        _train_one(db, current_user, model, 30)
        cached = get_trained(current_user.id, model)

    return TestPredictionsResponse(
        model_type=model,
        train_size=cached["train_size"],
        test_size=cached["test_size"],
        points=[TestPredictionPoint(**p) for p in cached["test_predictions"]],
    )


@router.get("/forecast/export")
def export_forecast(
    model: str = Query(default="xgboost"),
    horizon_days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resp = forecast(model=model, horizon_days=horizon_days, db=db, current_user=current_user)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "forecast_demand", "lower_bound", "upper_bound", "model", "mape"])
    for p in resp.points:
        writer.writerow([p.date, p.predicted, p.lower, p.upper, resp.model_type, resp.mape])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=forecast_{model}_{horizon_days}d.csv"},
    )


@router.get("/compare/export")
def export_compare(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    resp = compare(db=db, current_user=current_user)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["model", "mae", "rmse", "mape", "r2", "train_size", "test_size", "trained_at"])
    for m in resp.results:
        writer.writerow([m.model_type, m.mae, m.rmse, m.mape, m.r2, m.train_size, m.test_size, m.trained_at])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=model_comparison.csv"},
    )
