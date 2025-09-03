import uuid
from app import create_app


def _register(client):
    email = f"{uuid.uuid4().hex}@t.com"
    handle = uuid.uuid4().hex[:8]
    client.post(
        "/api/auth/register",
        json={"email": email, "display_name": "P", "handle": handle, "age": 20},
    )


def test_exec_echo_and_look():
    app = create_app()
    with app.test_client() as client:
        _register(client)
        resp = client.post("/api/console/exec", json={"line": "hello"})
        data = resp.get_json()
        assert resp.status_code == 200
        assert data["status"] == "ok"
        assert {f["type"] for f in data["frames"]} == {"text"}

        resp = client.post("/api/console/exec", json={"line": "look"})
        data = resp.get_json()
        assert len(data["frames"]) >= 2
        assert data["frames"][1]["type"] == "text"


def test_rate_limit():
    app = create_app()
    with app.test_client() as client:
        _register(client)
        for _ in range(5):
            r = client.post("/api/console/exec", json={"line": "hi"})
            assert r.status_code == 200
        r = client.post("/api/console/exec", json={"line": "hi"})
        assert r.status_code == 429
        data = r.get_json()
        assert data["status"] == "error"
