from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_ws_roundtrip():
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"id": "1", "type": "ping", "payload": {}})
        assert ws.receive_json() == {"id": "1", "type": "pong", "payload": {}}

        ws.send_json({"id": "2", "type": "user.message", "payload": {"text": "hello"}})
        reply = ws.receive_json()
        assert reply["id"] == "2"
        assert reply["type"] == "brain.reply"
        assert reply["payload"]["text"] == "Welcome, boss. You said: hello"

        ws.send_json({"id": "3", "type": "nope", "payload": {}})
        assert ws.receive_json()["type"] == "error"
