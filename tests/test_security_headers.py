from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_security_headers_present():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["database"] == "connected"
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert res.headers.get("Permissions-Policy") == "geolocation=(), microphone=(), camera=()"

def test_cors_allows_configured_origin_and_blocks_untrusted_origin():
    allowed_res = client.options(
        "/goals/",
        headers={
            "Origin": "http://localhost:5173",
            "Acess-Control-Request-Method": "GET",
        },
    )
    assert allowed_res.headers.get("access-control-allow-origin") == "http://localhost:5173"

    blocked_res = client.options(
        "/goals/",
        headers={
            "Origin": "https://evil-attacker.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert blocked_res.headers.get("access-control-allow-origin") is None