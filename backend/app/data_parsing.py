import io

import pandas as pd

COLUMN_MAP = {
    "วันที่": "date",
    "ความต้องการ/ยอดขาย (ลูก)": "demand",
    "ราคาขายเฉลี่ย (บาท/ลูก)": "avg_price",
    "ราคาหน้าสวน/ต้นทุน (บาท/ลูก)": "cost_price",
    "ปริมาณผลผลิต/สต๊อก (ลูก)": "production_volume",
    "ฤดูกาล": "season",
    "วันหยุด/เทศกาล (0/1)": "is_holiday",
    "อุณหภูมิเฉลี่ย (°C)": "avg_temp",
    "ปริมาณน้ำฝน (มม.)": "rainfall",
    "จำนวนนักท่องเที่ยว (คน)": "tourists",
    "ช่องทางจำหน่าย": "channel",
    "จังหวัด": "location",
    "มีโปรโมชั่น (0/1)": "has_promotion",
    "หมายเหตุ": "note",
}

REQUIRED = {"date", "demand"}


class FileValidationError(ValueError):
    """Fatal, file-level problem: nothing can be imported."""


def _find_header_row(raw: pd.DataFrame) -> int:
    for i in range(min(len(raw), 20)):
        row_vals = [str(v).strip() for v in raw.iloc[i].tolist()]
        if "วันที่" in row_vals:
            return i
    raise FileValidationError('ไม่สามารถนำเข้าข้อมูลได้\n- ไม่พบแถวหัวคอลัมน์ที่มี "วันที่"')


def _read_excel_sheet(content: bytes) -> pd.DataFrame:
    xl = pd.ExcelFile(io.BytesIO(content))
    preferred = [s for s in xl.sheet_names if "ข้อมูล" in s]
    sheet_order = preferred + [s for s in xl.sheet_names if s not in preferred]

    for sheet in sheet_order:
        raw = xl.parse(sheet_name=sheet, header=None, dtype=str)
        try:
            _find_header_row(raw)
            return raw
        except FileValidationError:
            continue
    raise FileValidationError('ไม่สามารถนำเข้าข้อมูลได้\n- ไม่พบชีตข้อมูลที่มีคอลัมน์ "วันที่" ในไฟล์นี้')


def _blank(series: pd.Series) -> pd.Series:
    return series.isna() | (series.astype(str).str.strip() == "") | (series.astype(str).str.strip().str.lower() == "nan")


def parse_upload(filename: str, content: bytes) -> tuple[pd.DataFrame, dict]:
    """Parse and validate an uploaded file against the CoconutDSS template.

    Returns (clean_df, report). Raises FileValidationError for fatal,
    file-level problems (no data can be imported at all). Row-level
    problems (bad dates, non-numeric/negative demand, duplicates) are
    counted and reported but do not block import of the remaining
    valid rows.
    """
    if filename.lower().endswith(".csv"):
        raw = pd.read_csv(io.BytesIO(content), header=None, dtype=str)
    else:
        raw = _read_excel_sheet(content)

    header_idx = _find_header_row(raw)
    df = raw.iloc[header_idx + 1 :].copy()
    df.columns = [str(c).strip() for c in raw.iloc[header_idx].tolist()]

    df = df.rename(columns=COLUMN_MAP)
    df = df[[c for c in df.columns if c in COLUMN_MAP.values()]]

    missing_cols = REQUIRED - set(df.columns)
    if missing_cols:
        names = {"date": "วันที่", "demand": "ความต้องการ/ยอดขาย (ลูก)"}
        lines = [f"- ไม่พบคอลัมน์ {names[c]}" for c in missing_cols]
        raise FileValidationError("ไม่สามารถนำเข้าข้อมูลได้\n" + "\n".join(lines))

    # Drop fully-blank trailing rows (not real data entries, not "missing values")
    all_blank = _blank(df["date"]) & _blank(df["demand"])
    df = df[~all_blank].reset_index(drop=True)
    rows_total = len(df)

    if rows_total == 0:
        raise FileValidationError("ไม่สามารถนำเข้าข้อมูลได้\n- ไม่พบข้อมูลในไฟล์")

    # 1. Missing values (blank date or demand before any parsing)
    missing_mask = _blank(df["date"]) | _blank(df["demand"])
    missing_value_rows = int(missing_mask.sum())
    df = df[~missing_mask].reset_index(drop=True)

    # 2. Date format
    parsed_date = pd.to_datetime(df["date"], errors="coerce")
    invalid_date_mask = parsed_date.isna()
    invalid_date_rows = int(invalid_date_mask.sum())
    df = df[~invalid_date_mask].reset_index(drop=True)
    df["date"] = parsed_date[~invalid_date_mask].dt.date.reset_index(drop=True)

    # 3. Demand must be numeric
    parsed_demand = pd.to_numeric(df["demand"], errors="coerce")
    invalid_demand_mask = parsed_demand.isna()
    invalid_demand_rows = int(invalid_demand_mask.sum())
    df = df[~invalid_demand_mask].reset_index(drop=True)
    df["demand"] = parsed_demand[~invalid_demand_mask].reset_index(drop=True)

    # 4. Negative demand
    negative_mask = df["demand"] < 0
    negative_demand_rows = int(negative_mask.sum())
    df = df[~negative_mask].reset_index(drop=True)

    # 5. Duplicate dates — with multi-location data the same date legitimately
    # repeats once per location, so dedup on (date, location) when a location
    # column is present, otherwise on date alone (single-series data).
    dedup_subset = ["date", "location"] if "location" in df.columns else ["date"]
    df = df.sort_values(dedup_subset).reset_index(drop=True)
    dup_mask = df.duplicated(subset=dedup_subset, keep="last")
    duplicate_date_rows = int(dup_mask.sum())
    df = df[~dup_mask].reset_index(drop=True)

    other_numeric_cols = [
        "avg_price",
        "cost_price",
        "production_volume",
        "avg_temp",
        "rainfall",
        "tourists",
    ]
    for col in other_numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in ["is_holiday", "has_promotion"]:
        if col in df.columns:
            df[col] = (
                pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int).astype(bool)
            )
        else:
            df[col] = False

    for col in ["season", "channel", "location", "note"]:
        if col not in df.columns:
            df[col] = None
        else:
            df[col] = df[col].astype(str).where(df[col].notna(), None)

    rows_imported = len(df)
    rows_skipped = rows_total - rows_imported

    warnings = []
    if missing_value_rows:
        warnings.append(f"พบข้อมูลว่าง (Missing Value) {missing_value_rows} รายการ (ถูกข้าม)")
    if invalid_date_rows:
        warnings.append(f"พบรูปแบบวันที่ไม่ถูกต้อง {invalid_date_rows} รายการ (ถูกข้าม)")
    if invalid_demand_rows:
        warnings.append(f"พบค่าความต้องการที่ไม่ใช่ตัวเลข {invalid_demand_rows} รายการ (ถูกข้าม)")
    if negative_demand_rows:
        warnings.append(f"พบค่าความต้องการติดลบ {negative_demand_rows} รายการ (ถูกข้าม)")
    if duplicate_date_rows:
        warnings.append(f"พบข้อมูลวันที่ซ้ำ {duplicate_date_rows} รายการ (เก็บแถวล่าสุดของแต่ละวันไว้)")

    if rows_imported == 0:
        raise FileValidationError(
            "ไม่สามารถนำเข้าข้อมูลได้ ไม่พบข้อมูลที่ถูกต้องเลยหลังตรวจสอบ\n" + "\n".join(f"- {w}" for w in warnings)
        )

    report = {
        "rows_total": rows_total,
        "rows_imported": rows_imported,
        "rows_skipped": rows_skipped,
        "missing_value_rows": missing_value_rows,
        "invalid_date_rows": invalid_date_rows,
        "invalid_demand_rows": invalid_demand_rows,
        "negative_demand_rows": negative_demand_rows,
        "duplicate_date_rows": duplicate_date_rows,
        "warnings": warnings,
    }
    return df, report
