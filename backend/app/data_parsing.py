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
    "มีโปรโมชั่น (0/1)": "has_promotion",
    "หมายเหตุ": "note",
}

REQUIRED = {"date", "demand"}


def _find_header_row(raw: pd.DataFrame) -> int:
    for i in range(min(len(raw), 20)):
        row_vals = [str(v).strip() for v in raw.iloc[i].tolist()]
        if "วันที่" in row_vals:
            return i
    raise ValueError('ไม่พบแถวหัวคอลัมน์ (ต้องมีคอลัมน์ "วันที่")')


def _read_excel_sheet(content: bytes) -> pd.DataFrame:
    xl = pd.ExcelFile(io.BytesIO(content))
    preferred = [s for s in xl.sheet_names if "ข้อมูล" in s]
    sheet_order = preferred + [s for s in xl.sheet_names if s not in preferred]

    for sheet in sheet_order:
        raw = xl.parse(sheet_name=sheet, header=None, dtype=str)
        try:
            _find_header_row(raw)
            return raw
        except ValueError:
            continue
    raise ValueError('ไม่พบชีตข้อมูลที่มีคอลัมน์ "วันที่" ในไฟล์นี้')


def parse_upload(filename: str, content: bytes) -> pd.DataFrame:
    if filename.lower().endswith(".csv"):
        raw = pd.read_csv(io.BytesIO(content), header=None, dtype=str)
    else:
        raw = _read_excel_sheet(content)

    header_idx = _find_header_row(raw)
    df = raw.iloc[header_idx + 1 :].copy()
    df.columns = [str(c).strip() for c in raw.iloc[header_idx].tolist()]

    df = df.rename(columns=COLUMN_MAP)
    df = df[[c for c in df.columns if c in COLUMN_MAP.values()]]

    missing = REQUIRED - set(df.columns)
    if missing:
        raise ValueError(f"ไฟล์ขาดคอลัมน์ที่จำเป็น: {', '.join(missing)}")

    df = df.dropna(subset=["date", "demand"], how="any")
    df = df[df["date"].astype(str).str.strip() != ""]

    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df = df.dropna(subset=["date"])

    numeric_cols = [
        "demand",
        "avg_price",
        "cost_price",
        "production_volume",
        "avg_temp",
        "rainfall",
        "tourists",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["demand"])

    for col in ["is_holiday", "has_promotion"]:
        if col in df.columns:
            df[col] = (
                pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int).astype(bool)
            )
        else:
            df[col] = False

    for col in ["season", "channel", "note"]:
        if col not in df.columns:
            df[col] = None
        else:
            df[col] = df[col].astype(str).where(df[col].notna(), None)

    df = df.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    return df.reset_index(drop=True)
