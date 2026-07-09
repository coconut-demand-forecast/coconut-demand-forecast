import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def _fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    resp = client.post(
        "/api/auth/register",
        json={
            "name": "Test User",
            "organization": "farmer",
            "contact": "test@example.com",
            "password": "pass1234",
        },
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
