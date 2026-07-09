import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import TrainingRun, User
from app.records import load_records_df

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


@router.get("/summary")
def summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    df = load_records_df(db, current_user.id)
    if df.empty:
        return {
            "total_records": 0,
            "avg_demand_30d": None,
            "avg_price_30d": None,
            "growth_pct": None,
            "best_model": None,
            "best_r2": None,
        }

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")

    last_30 = df.tail(30)
    prev_30 = df.iloc[max(0, len(df) - 60) : max(0, len(df) - 30)]

    avg_demand_30d = float(last_30["demand"].mean())
    avg_price_30d = float(last_30["avg_price"].mean()) if last_30["avg_price"].notna().any() else None

    growth_pct = None
    if len(prev_30) > 0:
        prev_avg = float(prev_30["demand"].mean())
        if prev_avg:
            growth_pct = round((avg_demand_30d - prev_avg) / prev_avg * 100, 1)

    best_run = (
        db.query(TrainingRun)
        .filter(TrainingRun.owner_id == current_user.id)
        .order_by(TrainingRun.r2.desc())
        .first()
    )

    return {
        "total_records": int(len(df)),
        "avg_demand_30d": round(avg_demand_30d, 1),
        "avg_price_30d": round(avg_price_30d, 2) if avg_price_30d is not None else None,
        "growth_pct": growth_pct,
        "best_model": best_run.model_type if best_run else None,
        "best_r2": round(best_run.r2, 3) if best_run else None,
    }


@router.get("/demand-series")
def demand_series(
    days: int = Query(default=180, le=3650),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    df = load_records_df(db, current_user.id)
    if df.empty:
        return []
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").tail(days)
    return [{"date": row.date.date().isoformat(), "demand": row.demand} for row in df.itertuples()]


@router.get("/channel-breakdown")
def channel_breakdown(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    df = load_records_df(db, current_user.id)
    if df.empty:
        return []
    grouped = (
        df.dropna(subset=["channel"])
        .groupby("channel")["demand"]
        .sum()
        .sort_values(ascending=False)
    )
    total = grouped.sum() or 1
    return [
        {"channel": channel, "total_demand": float(val), "pct": round(float(val) / total * 100, 1)}
        for channel, val in grouped.items()
    ]


@router.get("/seasonal-pattern")
def seasonal_pattern(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    df = load_records_df(db, current_user.id)
    if df.empty:
        return []
    df["date"] = pd.to_datetime(df["date"])
    df["month"] = df["date"].dt.month
    grouped = df.groupby("month")["demand"].mean()
    return [
        {"month": MONTHS_TH[m - 1], "avg_demand": round(float(v), 1)}
        for m, v in grouped.items()
    ]
