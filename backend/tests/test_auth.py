def test_register_and_me(client):
    resp = client.post(
        "/api/auth/register",
        json={"name": "Alice", "organization": "farmer", "contact": "alice@example.com", "password": "secret123"},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["contact"] == "alice@example.com"


def test_duplicate_register_rejected(client):
    payload = {"name": "Bob", "organization": "farmer", "contact": "bob@example.com", "password": "secret123"}
    assert client.post("/api/auth/register", json=payload).status_code == 200
    assert client.post("/api/auth/register", json=payload).status_code == 400


def test_login_wrong_password(client):
    client.post(
        "/api/auth/register",
        json={"name": "Carl", "organization": "farmer", "contact": "carl@example.com", "password": "secret123"},
    )
    resp = client.post("/api/auth/login", json={"contact": "carl@example.com", "password": "wrong"})
    assert resp.status_code == 401


def test_protected_route_requires_token(client):
    resp = client.get("/api/data/summary")
    assert resp.status_code == 401
