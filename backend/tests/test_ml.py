def test_train_insufficient_data_returns_400(client, auth_headers):
    resp = client.post(
        "/api/ml/train",
        headers=auth_headers,
        json={"models": ["random_forest"], "horizon_days": 30},
    )
    assert resp.status_code == 400


def test_train_and_forecast(client, auth_headers):
    load_resp = client.post("/api/data/load-sample", headers=auth_headers)
    assert load_resp.status_code == 200

    train_resp = client.post(
        "/api/ml/train",
        headers=auth_headers,
        json={"models": ["random_forest", "xgboost", "lightgbm"], "horizon_days": 30},
    )
    assert train_resp.status_code == 200
    body = train_resp.json()
    assert len(body["results"]) == 3
    assert body["best_model"] in {"random_forest", "xgboost", "lightgbm"}
    for m in body["results"]:
        assert 0 <= m["r2"] <= 1
        assert m["mae"] >= 0

    forecast_resp = client.get(
        "/api/ml/forecast",
        headers=auth_headers,
        params={"model": "xgboost", "horizon_days": 14},
    )
    assert forecast_resp.status_code == 200
    points = forecast_resp.json()["points"]
    assert len(points) == 14
    for p in points:
        assert p["lower"] <= p["predicted"] <= p["upper"]
        assert p["predicted"] >= 0

    compare_resp = client.get("/api/ml/compare", headers=auth_headers)
    assert compare_resp.status_code == 200
    assert len(compare_resp.json()["results"]) == 3


def test_forecast_without_prior_train_lazy_trains(client, auth_headers):
    client.post("/api/data/load-sample", headers=auth_headers)
    resp = client.get(
        "/api/ml/forecast",
        headers=auth_headers,
        params={"model": "lightgbm", "horizon_days": 7},
    )
    assert resp.status_code == 200
    assert len(resp.json()["points"]) == 7
