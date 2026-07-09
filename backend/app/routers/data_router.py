import csv
import io
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.data_parsing import parse_upload
from app.database import get_db
from app.ml.cache import clear_user
from app.models import DemandRecord, User
from app.schemas import DemandRecordOut, UploadResult

router = APIRouter(prefix="/api/data", tags=["data"])

SAMPLE_FILE = Path(__file__).resolve().parent.parent / "data" / "sample_template.xlsx"


def _save_dataframe(df, owner_id: int, db: Session) -> int:
    records = [
        DemandRecord(
            owner_id=owner_id,
            date=row.date,
            demand=row.demand,
            avg_price=row.avg_price if "avg_price" in df.columns else None,
            cost_price=row.cost_price if "cost_price" in df.columns else None,
            production_volume=row.production_volume if "production_volume" in df.columns else None,
            season=row.season,
            is_holiday=bool(row.is_holiday),
            avg_temp=row.avg_temp if "avg_temp" in df.columns else None,
            rainfall=row.rainfall if "rainfall" in df.columns else None,
            tourists=row.tourists if "tourists" in df.columns else None,
            channel=row.channel,
            has_promotion=bool(row.has_promotion),
            note=row.note,
        )
        for row in df.itertuples(index=False)
    ]
    db.bulk_save_objects(records)
    db.commit()
    return len(records)


@router.post("/upload", response_model=UploadResult)
def upload_data(
    file: UploadFile = File(...),
    replace: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = file.file.read()
    try:
        df = parse_upload(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if df.empty:
        raise HTTPException(status_code=400, detail="ไม่พบข้อมูลที่ใช้งานได้ในไฟล์")

    warnings = []
    if replace:
        db.query(DemandRecord).filter(DemandRecord.owner_id == current_user.id).delete()
        db.commit()

    imported = _save_dataframe(df, current_user.id, db)
    clear_user(current_user.id)
    return UploadResult(rows_imported=imported, rows_skipped=0, warnings=warnings)


@router.post("/load-sample", response_model=UploadResult)
def load_sample(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    content = SAMPLE_FILE.read_bytes()
    try:
        df = parse_upload(SAMPLE_FILE.name, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.query(DemandRecord).filter(DemandRecord.owner_id == current_user.id).delete()
    db.commit()

    imported = _save_dataframe(df, current_user.id, db)
    clear_user(current_user.id)
    return UploadResult(rows_imported=imported, rows_skipped=0, warnings=[])


@router.get("/records", response_model=list[DemandRecordOut])
def list_records(
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(DemandRecord)
        .filter(DemandRecord.owner_id == current_user.id)
        .order_by(DemandRecord.date.desc())
        .offset(offset)
        .limit(limit)
    )
    return q.all()


@router.get("/summary")
def data_summary(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    q = db.query(DemandRecord).filter(DemandRecord.owner_id == current_user.id)
    count = q.count()
    if count == 0:
        return {"count": 0, "date_from": None, "date_to": None}
    first = q.order_by(DemandRecord.date.asc()).first()
    last = q.order_by(DemandRecord.date.desc()).first()
    return {"count": count, "date_from": first.date, "date_to": last.date}


@router.delete("/records")
def clear_records(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    deleted = (
        db.query(DemandRecord).filter(DemandRecord.owner_id == current_user.id).delete()
    )
    db.commit()
    clear_user(current_user.id)
    return {"deleted": deleted}


@router.get("/export")
def export_csv(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    records = (
        db.query(DemandRecord)
        .filter(DemandRecord.owner_id == current_user.id)
        .order_by(DemandRecord.date.asc())
        .all()
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "date",
            "demand",
            "avg_price",
            "cost_price",
            "production_volume",
            "season",
            "is_holiday",
            "avg_temp",
            "rainfall",
            "tourists",
            "channel",
            "has_promotion",
            "note",
        ]
    )
    for r in records:
        writer.writerow(
            [
                r.date,
                r.demand,
                r.avg_price,
                r.cost_price,
                r.production_volume,
                r.season,
                int(r.is_holiday),
                r.avg_temp,
                r.rainfall,
                r.tourists,
                r.channel,
                int(r.has_promotion),
                r.note,
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=coconut_demand_export.csv"},
    )
