import datetime as dt
import io

CSV_HEADER = (
    "วันที่,ความต้องการ/ยอดขาย (ลูก),ราคาขายเฉลี่ย (บาท/ลูก),จังหวัด,ช่องทางจำหน่าย\n"
)


def _make_multi_location_csv(n_days=80):
    lines = [CSV_HEADER]
    start = dt.date(2024, 1, 1)
    for i in range(n_days):
        d = (start + dt.timedelta(days=i)).isoformat()
        lines.append(f"{d},2000,22,ราชบุรี,ค้าปลีก\n")
        lines.append(f"{d},1500,22,นครปฐม,ค้าปลีก\n")
    return "".join(lines).encode("utf-8")


def test_same_date_different_location_not_flagged_duplicate(client, auth_headers):
    csv_bytes = _make_multi_location_csv(80)
    resp = client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("data.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["duplicate_date_rows"] == 0
    assert body["rows_imported"] == 160


def test_locations_endpoint_lists_distinct_locations(client, auth_headers):
    client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("data.csv", io.BytesIO(_make_multi_location_csv(80)), "text/csv")},
    )
    resp = client.get("/api/data/locations", headers=auth_headers)
    assert resp.status_code == 200
    assert sorted(resp.json()["locations"]) == ["นครปฐม", "ราชบุรี"]


def test_train_is_scoped_to_selected_location(client, auth_headers):
    client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("data.csv", io.BytesIO(_make_multi_location_csv(80)), "text/csv")},
    )
    resp = client.post(
        "/api/ml/train",
        headers=auth_headers,
        params={"location": "ราชบุรี"},
        json={"models": ["random_forest"], "horizon_days": 7},
    )
    assert resp.status_code == 200
    # 80 days per location - 30 warmup = 50 usable rows, all from ราชบุรี only
    body = resp.json()
    assert body["results"][0]["train_size"] + body["results"][0]["test_size"] == 50


def test_forecast_without_location_on_multi_location_data_still_responds(client, auth_headers):
    """No location filter combines all locations' rows — not ideal
    methodologically, but must not crash; the frontend always picks a
    location for multi-location datasets."""
    client.post(
        "/api/data/upload",
        headers=auth_headers,
        files={"file": ("data.csv", io.BytesIO(_make_multi_location_csv(80)), "text/csv")},
    )
    resp = client.post(
        "/api/ml/train",
        headers=auth_headers,
        json={"models": ["random_forest"], "horizon_days": 7},
    )
    assert resp.status_code == 200
