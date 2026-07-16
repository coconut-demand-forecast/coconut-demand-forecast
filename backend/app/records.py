from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.models import DemandRecord

# Sentinel passed as the `location` query param to mean "combine every
# location into one national series" rather than "no location filter"
# (the latter is only used internally for legacy single-series datasets
# that never had a location column at all).
ALL_LOCATIONS = "__all__"


def _aggregate_all_locations(df: pd.DataFrame) -> pd.DataFrame:
    """Collapse a multi-location frame into one row per date: a genuine
    national daily series (sum demand/production, average price/weather)
    rather than raw overlapping rows, so it can go through the exact same
    feature-engineering/train pipeline as any single real location."""
    if df.empty or df["location"].nunique(dropna=True) <= 1:
        return df

    agg = (
        df.groupby("date")
        .agg(
            demand=("demand", "sum"),
            avg_price=("avg_price", "mean"),
            cost_price=("cost_price", "mean"),
            production_volume=("production_volume", "sum"),
            season=("season", "first"),
            is_holiday=("is_holiday", "max"),
            avg_temp=("avg_temp", "mean"),
            rainfall=("rainfall", "mean"),
            tourists=("tourists", "sum"),
            has_promotion=("has_promotion", "max"),
        )
        .reset_index()
    )
    agg["location"] = ALL_LOCATIONS
    agg["channel"] = None
    return agg


def load_records_df(db: Session, owner_id: int, location: Optional[str] = None) -> pd.DataFrame:
    q = db.query(DemandRecord).filter(DemandRecord.owner_id == owner_id)
    if location is not None and location != ALL_LOCATIONS:
        q = q.filter(DemandRecord.location == location)
    rows = q.order_by(DemandRecord.date.asc()).all()
    data = [
        {
            "date": r.date,
            "location": r.location,
            "demand": r.demand,
            "avg_price": r.avg_price,
            "cost_price": r.cost_price,
            "production_volume": r.production_volume,
            "season": r.season,
            "is_holiday": r.is_holiday,
            "avg_temp": r.avg_temp,
            "rainfall": r.rainfall,
            "tourists": r.tourists,
            "channel": r.channel,
            "has_promotion": r.has_promotion,
        }
        for r in rows
    ]
    df = pd.DataFrame(data)
    if location == ALL_LOCATIONS and not df.empty:
        df = _aggregate_all_locations(df)
    return df


def list_locations(db: Session, owner_id: int) -> list[str]:
    rows = (
        db.query(DemandRecord.location)
        .filter(DemandRecord.owner_id == owner_id, DemandRecord.location.isnot(None))
        .distinct()
        .order_by(DemandRecord.location.asc())
        .all()
    )
    return [r[0] for r in rows]
