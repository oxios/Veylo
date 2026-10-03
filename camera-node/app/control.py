"""WebSocket control channel to the main server (opened by the node, so the node needs no public address)."""

from __future__ import annotations

import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

import websocket

log = logging.getLogger("camera-node.control")

Handler = Callable[[dict], object]


class ControlChannel(threading.Thread):
    """Receives commands; handlers run in a pool. A handler's return value is sent back as the reply
    to commands that carry a requestId; an exception becomes an error reply."""

    def __init__(self, url: str, token: str, handlers: dict[str, Handler], on_connect: Callable[[], None]):
        super().__init__(name="control", daemon=True)
        self.url = url
        self.token = token
        self.handlers = handlers
        self.on_connect = on_connect
        self.pool = ThreadPoolExecutor(max_workers=6, thread_name_prefix="command")
        self.app: websocket.WebSocketApp | None = None
        self.connected = threading.Event()
        self.stopped = threading.Event()
        self._send_lock = threading.Lock()

    def run(self) -> None:
        backoff = 1.0
        while not self.stopped.is_set():
            self.app = websocket.WebSocketApp(
                self.url,
                header=[f"Authorization: Bearer {self.token}"],
                on_open=self._on_open,
                on_message=self._on_message,
                on_close=self._on_close,
                on_error=self._on_error,
            )
            started = time.monotonic()
            self.app.run_forever(ping_interval=20, ping_timeout=10)
            self.connected.clear()
            if time.monotonic() - started > 30:
                backoff = 1.0
            self.stopped.wait(backoff)
            backoff = min(30.0, backoff * 2)

    def stop(self) -> None:
        self.stopped.set()
        if self.app:
            self.app.close()

    def _on_open(self, _app) -> None:
        self.connected.set()
        log.info("control channel connected")
        self.on_connect()

    def _on_close(self, _app, code, reason) -> None:
        if self.connected.is_set():
            log.warning("control channel closed (%s %s)", code, reason)

    def _on_error(self, _app, error) -> None:
        text = str(error)
        if "401" in text:
            log.error("the main server rejected NODE_TOKEN; issue a new token in the admin panel")
        elif "403" in text:
            log.error("this node is disabled in the admin panel")
        else:
            log.debug("control channel error: %s", text)

    def send(self, message: dict) -> bool:
        app = self.app
        if not app or not self.connected.is_set():
            return False
        try:
            with self._send_lock:
                app.send(json.dumps(message, separators=(",", ":")))
            return True
        except Exception:  # noqa: BLE001 - a broken socket reconnects on its own
            return False

    def _on_message(self, _app, raw: str) -> None:
        try:
            message = json.loads(raw)
        except ValueError:
            return
        handler = self.handlers.get(message.get("type"))
        if handler is None:
            return
        self.pool.submit(self._run, handler, message)

    def _run(self, handler: Handler, message: dict) -> None:
        request_id = message.get("requestId")
        try:
            data = handler(message)
            if request_id:
                self.send({"type": "reply", "requestId": request_id, "ok": True, "data": data})
        except Exception as error:  # noqa: BLE001 - every failure must reach the caller
            log.warning("command %s failed: %s", message.get("type"), error)
            if request_id:
                self.send({"type": "reply", "requestId": request_id, "ok": False, "error": str(error)[:300], "code": getattr(error, "code", "NODE_ERROR")})
