import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.ml.cache import get_trained, set_trained
from app.ml.forecast import generate_forecast
from app.ml.pipeline import train_and_evaluate
from app.models import TrainingRun, User
from app.records import load_records_df
from app.schemas import ForecastPoint, ForecastResponse, ModelMetrics, TrainRequest, TrainResponse

router = APIRouter(prefix="/api/ml", tags=["ml"])

MODEL_LABELS = {
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
    "lightgbm": "LightGBM",
}


def _train_one(db: Session, user: User, model_type: str, horizon_days: int) -> TrainingRun:
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
        },
    )

    run = TrainingRun(
        owner_id=user.id,
        model_type=model_type,
        horizon_days=horizon_days,
        mae=result["mae"],
        rmse=result["rmse"],
        mape=result["mape"],
        r2=result["r2"],
        feature_importance=result["feature_importance"],
        residual_std=result["residual_std"],
        trained_at=dt.datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.post("/train", response_model=TrainResponse)
def train(
    payload: TrainRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    runs = [
        _train_one(db, current_user, model_type, payload.horizon_days)
        for model_type in payload.models
    ]
    best = max(runs, key=lambda r: r.r2)
    return TrainResponse(
        results=[ModelMetrics.model_validate(r) for r in runs],
        best_model=best.model_type,
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

    best = max(latest_runs, key=lambda r: r.r2)
    return TrainResponse(
        results=[ModelMetrics.model_validate(r) for r in latest_runs],
        best_model=best.model_type,
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
    if cached is None:
        _train_one(db, current_user, model, horizon_days)
        cached = get_trained(current_user.id, model)

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
    )
