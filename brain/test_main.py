import os

os.environ["BOOGEYMAN_VOICE"] = "0"  # no hardware or network in tests
# Empty (not missing) so brain/.env on a dev machine can't fill them in.
for k in ("ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "GROQ_API_KEY", "GROK_API_KEY", "LLM_API_KEY"):
    os.environ[k] = ""
os.environ["LLM_PROVIDER"] = "auto"
import tempfile  # noqa: E402

os.environ["BOOGEYMAN_DATA"] = tempfile.mkdtemp()  # never touch the real memory

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
        assert ack["payload"]["capabilities"]["brain"] == "built-in"

        ws.send_json({"id": "5", "type": "nope", "payload": {}})
        assert recv_reply(ws, "5")["type"] == "error"
