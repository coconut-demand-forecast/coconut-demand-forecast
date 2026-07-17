import datetime as dt
import io
from pathlib import Path
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.records import ALL_LOCATIONS
from app.schemas import ForecastResponse

FONT_PATH = Path(__file__).resolve().parent / "data" / "fonts" / "NotoSansThai.ttf"
FONT_NAME = "NotoSansThai"
_registered = False

MODEL_LABELS = {
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
    "lightgbm": "LightGBM",
}
THAI_MONTHS_FULL = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]

PRIMARY = colors.HexColor("#14664a")
PRIMARY_LIGHT = colors.HexColor("#eaf5ef")
TEXT_MUTED = colors.HexColor("#5a6a63")
BORDER = colors.HexColor("#dbe7e0")
WARN_BG = colors.HexColor("#fdf3e6")


def _ensure_font_registered() -> None:
    global _registered
    if not _registered:
        pdfmetrics.registerFont(TTFont(FONT_NAME, str(FONT_PATH)))
        _registered = True


def _location_label(location: Optional[str]) -> str:
    if location is None:
        return "ไม่ระบุ (รวมทุกแถวที่มี)"
    if location == ALL_LOCATIONS:
        return "ทั้งหมด (ทุกพื้นที่)"
    return location


def _month_label(month: str) -> str:
    year, m = month.split("-")
    return f"{THAI_MONTHS_FULL[int(m) - 1]} {int(year) + 543}"


def build_forecast_report_pdf(
    resp: ForecastResponse,
    location: Optional[str],
    month: Optional[str] = None,
) -> bytes:
    """A self-contained PDF summary of one forecast run: the parameters
    used to generate it (location/model/horizon), the model's accuracy on
    historical data, the forecast summary, and a data table — so a farmer
    can print or share what the system predicted without needing to log
    back into the app. If `month` is given, the data table and totals are
    narrowed to that specific calendar month instead of the full horizon.
    """
    _ensure_font_registered()

    styles = {
        "title": ParagraphStyle("title", fontName=FONT_NAME, fontSize=18, textColor=PRIMARY, leading=24, spaceAfter=4),
        "subtitle": ParagraphStyle("subtitle", fontName=FONT_NAME, fontSize=10, textColor=TEXT_MUTED, leading=14),
        "h2": ParagraphStyle("h2", fontName=FONT_NAME, fontSize=13, textColor=PRIMARY, leading=18, spaceBefore=14, spaceAfter=6),
        "body": ParagraphStyle("body", fontName=FONT_NAME, fontSize=10, textColor=colors.HexColor("#2a332e"), leading=15),
        "small": ParagraphStyle("small", fontName=FONT_NAME, fontSize=8.5, textColor=TEXT_MUTED, leading=13),
    }

    points = resp.points
    period_label = f"{resp.horizon_days} วัน"
    if month:
        month_points = [p for p in points if p.date.strftime("%Y-%m") == month]
        if month_points:
            points = month_points
            period_label = _month_label(month)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=18 * mm, bottomMargin=16 * mm, leftMargin=18 * mm, rightMargin=18 * mm,
    )
    elements = []

    elements.append(Paragraph("รายงานพยากรณ์ความต้องการมะพร้าวน้ำหอม", styles["title"]))
    elements.append(Paragraph(
        f"สร้างเมื่อ {dt.datetime.now().strftime('%d/%m/%Y %H:%M')} น. โดยระบบ CoconutDSS",
        styles["subtitle"],
    ))
    elements.append(Spacer(1, 10))

    param_rows = [
        ["พื้นที่", _location_label(location)],
        ["โมเดลที่ใช้", MODEL_LABELS.get(resp.model_type, resp.model_type)],
        ["ช่วงเวลาที่แสดง", period_label],
        ["เทรนโมเดลล่าสุดเมื่อ", resp.trained_at.strftime("%d/%m/%Y %H:%M") if resp.trained_at else "-"],
    ]
    param_table = Table(param_rows, colWidths=[45 * mm, 120 * mm])
    param_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT_NAME),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (0, -1), PRIMARY_LIGHT),
        ("TEXTCOLOR", (0, 0), (0, -1), PRIMARY),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(param_table)

    elements.append(Paragraph("ความแม่นยำของโมเดล (ประเมินจากข้อมูลย้อนหลัง)", styles["h2"]))
    accuracy_pct = max(0.0, min(100.0, 100 - resp.mape))
    acc_rows = [
        ["ความแม่นยำโดยประมาณ", f"{accuracy_pct:.1f}%"],
        ["MAPE (คลาดเคลื่อนเฉลี่ย %)", f"{resp.mape:.1f}%"],
        ["MAE (คลาดเคลื่อนเฉลี่ย หน่วยลูก)", f"{resp.mae:.1f}"],
        ["RMSE", f"{resp.rmse:.1f}"],
        ["R-squared (ความสอดคล้องกับข้อมูลจริง)", f"{resp.r2:.3f}"],
        ["ข้อมูล Train / Test", f"{resp.train_size:,} / {resp.test_size:,}"],
    ]
    acc_table = Table(acc_rows, colWidths=[70 * mm, 95 * mm])
    acc_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT_NAME),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (1, 0), colors.HexColor("#f7fbf9")),
    ]))
    elements.append(acc_table)
    elements.append(Paragraph(
        "โมเดลนี้ยังไม่ได้ผ่านการปรับจูน Hyperparameter ใช้ค่าพารามิเตอร์เริ่มต้นที่กำหนดไว้", styles["small"],
    ))

    elements.append(Paragraph("สรุปผลพยากรณ์" + (f" — {period_label}" if month else ""), styles["h2"]))
    values = [p.predicted for p in points]
    total = sum(values)
    avg = total / len(values) if values else 0
    summary_rows = [["ค่าเฉลี่ยต่อวัน", f"{avg:,.1f} ลูก"], ["ยอดรวมช่วงที่แสดง", f"{total:,.0f} ลูก"]]
    if not month:
        summary_rows += [
            ["ค่าสูงสุด", f"{resp.summary.max:,.1f} ลูก"],
            ["ค่าต่ำสุด", f"{resp.summary.min:,.1f} ลูก"],
            [
                "แนวโน้ม",
                {"increasing": "เพิ่มขึ้น", "decreasing": "ลดลง", "flat": "คงที่"}[resp.summary.trend]
                + f" ({resp.summary.trend_pct:+.1f}%)",
            ],
        ]
    summary_table = Table(summary_rows, colWidths=[70 * mm, 95 * mm])
    summary_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT_NAME),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(summary_table)

    elements.append(Paragraph("ตารางค่าพยากรณ์รายวัน", styles["h2"]))
    shown_points = points if month else points[:60]
    data_rows = [["วันที่", "ค่าพยากรณ์ (ลูก)", "ขอบล่าง", "ขอบบน"]]
    for p in shown_points:
        data_rows.append([p.date, f"{p.predicted:,.0f}", f"{p.lower:,.0f}", f"{p.upper:,.0f}"])
    data_table = Table(data_rows, colWidths=[45 * mm, 45 * mm, 37.5 * mm, 37.5 * mm], repeatRows=1)
    data_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT_NAME),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fbf9")]),
    ]))
    elements.append(data_table)
    if not month and len(points) > 60:
        elements.append(Paragraph(
            f"แสดง 60 วันแรกจากทั้งหมด {len(points)} วัน ดาวน์โหลดไฟล์ CSV จากหน้า \"พยากรณ์\" สำหรับข้อมูลครบถ้วน", styles["small"],
        ))

    elements.append(Paragraph("สมมติฐานที่ใช้ในการพยากรณ์อนาคต", styles["h2"]))
    elements.append(Paragraph(resp.assumptions, styles["small"]))

    doc.build(elements)
    return buf.getvalue()
