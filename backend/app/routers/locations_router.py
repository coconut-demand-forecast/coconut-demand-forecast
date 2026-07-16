from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.ml.pipeline import rank_key
from app.models import User
from app.records import ALL_LOCATIONS, list_locations, load_records_df
from app.routers.ml_router import MODEL_LABELS, _latest_runs_for_location, _train_one
from app.schemas import LocationCompareItem, LocationCompareResponse

router = APIRouter(prefix="/api/locations", tags=["locations"])


def _build_item(db: Session, current_user: User, loc: str, label: str, train_missing: bool) -> LocationCompareItem | None:
    df = load_records_df(db, current_user.id, location=loc)
    if df.empty:
        return None

    runs = _latest_runs_for_location(db, current_user.id, loc)
    if not runs and train_missing:
        runs = [_train_one(db, current_user, mt, 30, location=loc)[0] for mt in MODEL_LABELS]

    best = min(runs, key=rank_key) if runs else None
    return LocationCompareItem(
        location=label,
        record_count=len(df),
        avg_demand=round(float(df["demand"].mean()), 1),
        best_model=best.model_type if best else None,
        best_mape=round(best.mape, 1) if best else None,
        best_rmse=round(best.rmse, 1) if best else None,
        best_r2=round(best.r2, 3) if best else None,
    )


@router.get("/compare", response_model=LocationCompareResponse)
def compare_locations(
    train_missing: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cross-location snapshot: for every location the user has data for,
    show record count, average demand, and — if a model has already been
    trained for that location (or train_missing=True triggers one now) —
    its best-performing model and MAPE, so locations can be compared on
    equal footing. When more than one location exists, also includes an
    "All" row trained on the demand summed across every location (a real
    national daily series, not raw overlapping rows)."""
    locations = list_locations(db, current_user.id)
    items = []

    if len(locations) > 1:
        all_item = _build_item(db, current_user, ALL_LOCATIONS, ALL_LOCATIONS, train_missing)
        if all_item:
            items.append(all_item)

    for loc in locations:
        item = _build_item(db, current_user, loc, loc, train_missing)
        if item:
            items.append(item)

    return LocationCompareResponse(locations=items)
