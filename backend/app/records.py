from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.models import DemandRecord


def load_records_df(db: Session, owner_id: int, location: Optional[str] = None) -> pd.DataFrame:
    q = db.query(DemandRecord).filter(DemandRecord.owner_id == owner_id)
    if location is not None:
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
    return pd.DataFrame(data)


def list_locations(db: Session, owner_id: int) -> list[str]:
    rows = (
        db.query(DemandRecord.location)
        .filter(DemandRecord.owner_id == owner_id, DemandRecord.location.isnot(None))
        .distinct()
        .order_by(DemandRecord.location.asc())
        .all()
    )
    return [r[0] for r in rows]
