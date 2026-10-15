"""
Persistence for alert workflow, actions and imports.

Two implementations behind one interface:
- MemoryStore: default, no setup, resets on restart (demo mode).
- PostgresStore: used when DATABASE_URL is set (requires psycopg). Tables are
  created from schema.sql.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("coldguard.store")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryStore:
    kind = "memory"

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.alert_state: dict[str, dict] = {}
        self.actions: list[dict] = []
        self.imports: list[dict] = []
        self.unit_config: dict[str, dict] = {}

    def get_alert_state(self, alert_id: str) -> dict:
        return self.alert_state.get(alert_id, {"status": "new", "history": []})

    def update_alert(self, alert_id: str, status: str, note: str | None, by: str) -> dict:
        with self._lock:
            cur = self.get_alert_state(alert_id)
            hist = list(cur["history"])
            hist.append({"id": uuid.uuid4().hex[:10], "at": _now(), "kind": "status", "from": cur["status"], "to": status, "text": f"Status changed to {status}", "by": by})
            if note:
                hist.append({"id": uuid.uuid4().hex[:10], "at": _now(), "kind": "note", "from": status, "to": status, "text": note, "by": by})
            self.alert_state[alert_id] = {"status": status, "history": hist}
            return self.alert_state[alert_id]

    def add_action(self, alert_id: str | None, unit_id: str, action: str, note: str | None, by: str, status: str) -> dict:
        with self._lock:
            rec = {"id": f"ACT-{uuid.uuid4().hex[:8]}", "at": _now(), "alertId": alert_id, "unitId": unit_id, "action": action, "note": note, "by": by, "status": status}
            self.actions.append(rec)
            if alert_id:
                cur = self.get_alert_state(alert_id)
                cur = {"status": cur["status"], "history": cur["history"] + [{"id": uuid.uuid4().hex[:10], "at": rec["at"], "kind": "action", "from": cur["status"], "to": cur["status"], "text": f"Preventive action recorded: {action}", "by": by}]}
                self.alert_state[alert_id] = cur
            return rec

    def list_actions(self, alert_id: str | None = None) -> list[dict]:
        return [a for a in self.actions if alert_id is None or a["alertId"] == alert_id]

    def add_import(self, batch: dict) -> dict:
        with self._lock:
            self.imports.insert(0, batch)
            return batch

    def list_imports(self) -> list[dict]:
        return self.imports


class PostgresStore(MemoryStore):
    """Writes workflow data to PostgreSQL. Reads go through the same methods."""
    kind = "postgres"

    def __init__(self, dsn: str) -> None:
        super().__init__()
        import psycopg  # imported lazily so the demo runs without it

        self._conn = psycopg.connect(dsn, autocommit=True)
        schema = (Path(__file__).resolve().parent.parent / "schema.sql").read_text()
        with self._conn.cursor() as cur:
            cur.execute(schema)
        self._load()

    def _load(self) -> None:
        with self._conn.cursor() as cur:
            cur.execute("SELECT alert_id, status, history FROM alert_state")
            for alert_id, status, history in cur.fetchall():
                self.alert_state[alert_id] = {"status": status, "history": history}
            cur.execute("SELECT id, created_at, alert_id, unit_id, action, note, created_by, status FROM preventive_actions ORDER BY created_at")
            for r in cur.fetchall():
                self.actions.append({"id": r[0], "at": r[1].isoformat(), "alertId": r[2], "unitId": r[3], "action": r[4], "note": r[5], "by": r[6], "status": r[7]})

    def _save_alert(self, alert_id: str) -> None:
        st = self.alert_state[alert_id]
        with self._conn.cursor() as cur:
            cur.execute(
                "INSERT INTO alert_state (alert_id, status, history, updated_at) VALUES (%s, %s, %s, now()) "
                "ON CONFLICT (alert_id) DO UPDATE SET status = EXCLUDED.status, history = EXCLUDED.history, updated_at = now()",
                (alert_id, st["status"], json.dumps(st["history"])),
            )

    def update_alert(self, alert_id, status, note, by):
        res = super().update_alert(alert_id, status, note, by)
        self._save_alert(alert_id)
        return res

    def add_action(self, alert_id, unit_id, action, note, by, status):
        rec = super().add_action(alert_id, unit_id, action, note, by, status)
        with self._conn.cursor() as cur:
            cur.execute(
                "INSERT INTO preventive_actions (id, alert_id, unit_id, action, note, created_by, status) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (rec["id"], alert_id, unit_id, action, note, by, status),
            )
        if alert_id:
            self._save_alert(alert_id)
        return rec

    def add_import(self, batch):
        super().add_import(batch)
        with self._conn.cursor() as cur:
            cur.execute(
                "INSERT INTO import_batches (id, filename, total_rows, valid_rows, rejected_rows, summary) VALUES (%s, %s, %s, %s, %s, %s)",
                (batch["id"], batch["filename"], batch["total"], batch["valid"], batch["rejected"], json.dumps(batch["counts"])),
            )
            for r in batch.get("_records", []):
                cur.execute(
                    "INSERT INTO sensor_readings (unit_id, recorded_at, temperature_c, ambient_c, door_open, cooling_active, source, import_batch_id) "
                    "VALUES (%s, %s, %s, %s, %s, %s, 'imported', %s) ON CONFLICT DO NOTHING",
                    (r["unit_id"], r["timestamp"], r["temperature_c"], r["ambient_c"], r["door_open"], r["cooling_active"], batch["id"]),
                )
        return batch


def make_store():
    dsn = os.getenv("DATABASE_URL")
    if dsn:
        try:
            store = PostgresStore(dsn)
            log.info("Using PostgreSQL store")
            return store
        except Exception as exc:  # noqa: BLE001 - surface clearly and fall back
            log.error("PostgreSQL unavailable (%s); falling back to in-memory store", exc)
    log.info("Using in-memory store (demo mode)")
    return MemoryStore()
