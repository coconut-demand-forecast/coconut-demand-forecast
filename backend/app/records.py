import pandas as pd
from sqlalchemy.orm import Session

from app.models import DemandRecord


def load_records_df(db: Session, owner_id: int) -> pd.DataFrame:
    rows = (
        db.query(DemandRecord)
        .filter(DemandRecord.owner_id == owner_id)
        .order_by(DemandRecord.date.asc())
        .all()
    )
    data = [
        {
            "date": r.date,
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
