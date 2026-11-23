import os

os.environ["BOOGEYMAN_VOICE"] = "0"  # no hardware or network in tests
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ.pop("ELEVENLABS_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402


def test_health():
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


def recv_reply(ws, msg_id):
    # Skip pushed events (empty id) until the reply to msg_id arrives.
    while True:
        msg = ws.receive_json()
        if msg["id"] == msg_id:
            return msg


def test_ws_roundtrip():
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        ws.send_json({"id": "1", "type": "ping", "payload": {}})
        assert recv_reply(ws, "1") == {"id": "1", "type": "pong", "payload": {}}

        ws.send_json({"id": "2", "type": "user.message", "payload": {"text": "hello"}})
        reply = recv_reply(ws, "2")
        assert reply["type"] == "brain.reply"
        assert "boss" in reply["payload"]["text"].lower()

        ws.send_json({"id": "3", "type": "voice.mute", "payload": {"muted": True}})
        assert recv_reply(ws, "3")["payload"]["muted"] is True

        ws.send_json({"id": "4", "type": "voice.greet", "payload": {}})
        ack = recv_reply(ws, "4")
        assert ack["type"] == "voice.ack"
        assert ack["payload"]["capabilities"]["claude"] is False

        ws.send_json({"id": "5", "type": "nope", "payload": {}})
        assert recv_reply(ws, "5")["type"] == "error"
