import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jose import jwt

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

os.environ.setdefault("JWT_SECRET_KEY", "test_secret_key_for_pytest_suite_2026")

from main import app  # noqa: E402

SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = "HS256"


@pytest.fixture(scope="session", autouse=True)
def clear_rate_limiters():
    """Clears in-memory login/auth rate-limit buckets before running pytest."""
    for mod_name, mod in list(sys.modules.items()):
        if mod_name.startswith(("routers.", "main", "middleware", "utils", "core")):
            for attr_val in vars(mod).values():
                if isinstance(attr_val, dict) and any(
                    isinstance(k, str) and ("127.0.0.1" in k or "testclient" in k or "login" in k)
                    for k in attr_val.keys()
                ):
                    attr_val.clear()
    yield


def make_test_token(user_id: int, username: str = "testuser", expired: bool = False) -> str:
    now = datetime.now(timezone.utc)
    exp = now - timedelta(hours=1) if expired else now + timedelta(hours=2)
    payload = {
        "sub": username,
        "user_id": user_id,
        "exp": exp,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers_user1():
    token = make_test_token(user_id=1, username="alice")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_user2():
    token = make_test_token(user_id=2, username="bob")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def expired_auth_headers():
    token = make_test_token(user_id=1, username="alice", expired=True)
    return {"Authorization": f"Bearer {token}"}