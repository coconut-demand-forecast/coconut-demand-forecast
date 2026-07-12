import io

CSV_HEADER = (
    "วันที่,ความต้องการ/ยอดขาย (ลูก),ราคาขายเฉลี่ย (บาท/ลูก),ราคาหน้าสวน/ต้นทุน (บาท/ลูก),"
    "ปริมาณผลผลิต/สต๊อก (ลูก),ฤดูกาล,วันหยุด/เทศกาล (0/1),อุณหภูมิเฉลี่ย (°C),ปริมาณน้ำฝน (มม.),"
    "จำนวนนักท่องเที่ยว (คน),ช่องทางจำหน่าย,มีโปรโมชั่น (0/1),หมายเหตุ\n"
)


def _make_csv(n_rows=5):
    lines = [CSV_HEADER]
    for i in range(1, n_rows + 1):
        lines.append(f"2024-01-{i:02d},2000,22,17.5,2200,ฤดูหนาว,0,27,80,45000,ค้าปลีก,0,\n")
    return "".join(lines).encode("utf-8")


def test_upload_valid_csv(client, auth_headers):
    csv_bytes = _make_csv(5)
    resp = client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("data.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["rows_imported"] == 5

    summary = client.get("/api/data/summary", headers=auth_headers).json()
    assert summary["count"] == 5


def test_upload_missing_required_column_rejected(client, auth_headers):
    bad_csv = b"foo,bar\n1,2\n"
    resp = client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("bad.csv", io.BytesIO(bad_csv), "text/csv")},
    )
    assert resp.status_code == 400


def test_load_sample(client, auth_headers):
    resp = client.post("/api/data/load-sample", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["rows_imported"] > 1000

    summary = client.get("/api/data/summary", headers=auth_headers).json()
    assert summary["count"] == resp.json()["rows_imported"]


def test_upload_dry_run_does_not_write(client, auth_headers):
    resp = client.post(
        "/api/data/upload",
        headers=auth_headers,
        params={"dry_run": "true"},
        files={"file": ("data.csv", io.BytesIO(_make_csv(5)), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["dry_run"] is True
    assert body["rows_imported"] == 5

    summary = client.get("/api/data/summary", headers=auth_headers).json()
    assert summary["count"] == 0


def test_upload_reports_row_level_issues(client, auth_headers):
    lines = [CSV_HEADER]
    lines.append("2024-01-01,2000,22,17.5,2200,ฤดูหนาว,0,27,80,45000,ค้าปลีก,0,\n")  # valid
    lines.append("2024-01-01,2100,22,17.5,2200,ฤดูหนาว,0,27,80,45000,ค้าปลีก,0,\n")  # duplicate date
    lines.append(",2000,22,17.5,2200,ฤดูหนาว,0,27,80,45000,ค้าปลีก,0,\n")  # missing date
    lines.append("2024-01-05,not-a-number,22,17.5,2200,ฤดูหนาว,0,27,80,45000,ค้าปลีก,0,\n")  # invalid demand
    lines.append("2024-01-06,-50,22,17.5,2200,ฤดูหนาว,0,27,80,45000,ค้าปลีก,0,\n")  # negative demand
    csv_bytes = "".join(lines).encode("utf-8")

    resp = client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("data.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["rows_total"] == 5
    assert body["rows_imported"] == 1
    assert body["duplicate_date_rows"] == 1
    assert body["missing_value_rows"] == 1
    assert body["invalid_demand_rows"] == 1
    assert body["negative_demand_rows"] == 1
    assert len(body["warnings"]) == 4


def test_upload_all_invalid_rows_rejected(client, auth_headers):
    lines = [CSV_HEADER, "2024-01-01,-1,22,17.5,2200,ฤดูหนาว,0,27,80,45000,ค้าปลีก,0,\n"]
    csv_bytes = "".join(lines).encode("utf-8")
    resp = client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("data.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp.status_code == 400
    assert "ไม่สามารถนำเข้าข้อมูลได้" in resp.json()["detail"]


def test_upload_replace_true_clears_previous(client, auth_headers):
    client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("data.csv", io.BytesIO(_make_csv(5)), "text/csv")},
    )
    client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("data.csv", io.BytesIO(_make_csv(3)), "text/csv")},
    )
    summary = client.get("/api/data/summary", headers=auth_headers).json()
    assert summary["count"] == 3
