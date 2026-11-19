"""EVA human-factors prototype: local experiment controller and CSV recording."""
import csv
import io
import os
from datetime import datetime
from threading import Lock
from time import monotonic
from uuid import uuid4

from flask import Flask, Response, jsonify, render_template, request

app = Flask(__name__)
lock = Lock()
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

state = {
    "running": False, "mode": "normal", "list_mode": "all", "version": 0,
    "trial_id": None, "participant": "", "date": "", "notes": "",
    "normal_step": 0, "emergency_step": 0,
    "normal_clicks": 0, "emergency_clicks": 0,
    "progress_clicks": 0, "unnecessary_clicks": 0,
    "normal_progress_clicks": 0, "emergency_progress_clicks": 0,
    "normal_unnecessary_clicks": 0, "emergency_unnecessary_clicks": 0,
    "alert_count": 0, "reaction_time_ms": None, "acknowledged": False,
    "alert_id": 0, "alert_issued_at": None, "trial_started_at": None,
    "participant_connected_at": None,
}
EVENT_FIELDS = ["trial_id", "participant", "date", "notes", "list_mode", "timestamp", "elapsed_s", "event", "display_mode", "category", "step", "reaction_time_ms", "normal_clicks", "emergency_clicks", "progress_clicks", "unnecessary_clicks"]
SUMMARY_FIELDS = ["trial_id", "participant", "date", "notes", "list_mode", "started_at", "ended_at", "normal_clicks", "emergency_clicks", "total_clicks", "progress_clicks", "unnecessary_clicks", "normal_progress_clicks", "emergency_progress_clicks", "normal_unnecessary_clicks", "emergency_unnecessary_clicks", "alert_count", "reaction_time_ms", "normal_step", "emergency_step", "last_display_mode"]


def timestamp():
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


def snapshot():
    """Only call while holding lock."""
    return {key: value for key, value in state.items() if key not in ("alert_issued_at", "trial_started_at", "participant_connected_at")}


def save_csv(filename, fields, rows):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def log_event(event, category="", reaction_time_ms=None):
    """Only call while holding lock."""
    if not state["trial_id"]:
        return
    elapsed = round(monotonic() - state["trial_started_at"], 3) if state["trial_started_at"] else None
    row = {"trial_id": state["trial_id"], "participant": state["participant"],
           "date": state["date"], "notes": state["notes"], "list_mode": state["list_mode"],
           "timestamp": timestamp(), "elapsed_s": elapsed, "event": event,
           "display_mode": state["mode"], "category": category,
           "step": state["emergency_step"] if state["mode"] == "emergency" else state["normal_step"],
           "reaction_time_ms": reaction_time_ms,
           "normal_clicks": state["normal_clicks"], "emergency_clicks": state["emergency_clicks"],
           "progress_clicks": state["progress_clicks"], "unnecessary_clicks": state["unnecessary_clicks"]}
    events.append(row)
    save_csv(f"{state['trial_id']}_events.csv", EVENT_FIELDS, events)


def save_summary():
    """Only call while holding lock."""
    row = {"trial_id": state["trial_id"], "participant": state["participant"],
           "date": state["date"], "notes": state["notes"], "list_mode": state["list_mode"],
           "started_at": trial_started_wall, "ended_at": timestamp(),
           "normal_clicks": state["normal_clicks"], "emergency_clicks": state["emergency_clicks"],
           "total_clicks": state["normal_clicks"] + state["emergency_clicks"],
           "progress_clicks": state["progress_clicks"], "unnecessary_clicks": state["unnecessary_clicks"],
           "normal_progress_clicks": state["normal_progress_clicks"],
           "emergency_progress_clicks": state["emergency_progress_clicks"],
           "normal_unnecessary_clicks": state["normal_unnecessary_clicks"],
           "emergency_unnecessary_clicks": state["emergency_unnecessary_clicks"],
           "alert_count": state["alert_count"], "reaction_time_ms": state["reaction_time_ms"],
           "normal_step": state["normal_step"], "emergency_step": state["emergency_step"],
           "last_display_mode": state["mode"]}
    save_csv(f"{state['trial_id']}_summary.csv", SUMMARY_FIELDS, [row])


events = []
trial_started_wall = None


@app.get("/")
def participant():
    return render_template("participant.html")


@app.get("/control")
def control():
    return render_template("control.html")


@app.get("/api/state")
def get_state():
    with lock:
        return jsonify(snapshot())


@app.post("/api/start")
def start_trial():
    global events, trial_started_wall
    data = request.get_json(silent=True) or {}
    name = str(data.get("participant", "")).strip()[:120]
    date = str(data.get("date", "")).strip()[:30]
    notes = str(data.get("notes", "")).strip()[:2000]
    list_mode = data.get("list_mode")
    if not name or not date or list_mode not in ("all", "current"):
        return jsonify(error="Participant name, date, and list mode are required."), 400
    with lock:
        if state["running"]:
            return jsonify(error="Stop the current experiment first."), 409
        state.update(running=True, mode="normal", list_mode=list_mode,
                     version=state["version"] + 1, trial_id=f"trial_{datetime.now():%Y%m%d_%H%M%S}_{uuid4().hex[:6]}",
                     participant=name, date=date, notes=notes,
                     normal_step=0, emergency_step=0, normal_clicks=0, emergency_clicks=0,
                     progress_clicks=0, unnecessary_clicks=0,
                     normal_progress_clicks=0, emergency_progress_clicks=0,
                     normal_unnecessary_clicks=0, emergency_unnecessary_clicks=0,
                     alert_count=0, reaction_time_ms=None, acknowledged=False,
                     alert_id=0, alert_issued_at=None, trial_started_at=monotonic())
        events = []
        trial_started_wall = timestamp()
        log_event("experiment_started")
        return jsonify(snapshot())


@app.post("/api/stop")
def stop_trial():
    with lock:
        if not state["running"]:
            return jsonify(error="No experiment running."), 409
        log_event("experiment_stopped")
        state["running"] = False
        state["version"] += 1
        save_summary()
        return jsonify(snapshot())


@app.post("/api/mode")
def set_mode():
    data = request.get_json(silent=True) or {}
    mode = data.get("mode")
    if mode not in ("normal", "emergency"):
        return jsonify(error="Invalid mode"), 400
    with lock:
        if not state["running"]:
            return jsonify(error="Start an experiment first"), 409
        if state["mode"] != mode:
            state["mode"] = mode
            state["version"] += 1
            if mode == "emergency":
                state["alert_id"] += 1
                state["alert_count"] += 1
                state["alert_issued_at"] = monotonic()
                state["acknowledged"] = False
                state["reaction_time_ms"] = None
                log_event("emergency_triggered")
            else:
                log_event("normal_restored")
        return jsonify(snapshot())


@app.post("/api/interaction")
def interaction():
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    mode = data.get("mode")
    trial_id = data.get("trial_id")
    allowed = {"advance", "expand", "background", "acknowledge"}
    if kind not in allowed:
        return jsonify(error="Unknown interaction"), 400
    with lock:
        if not state["running"] or trial_id != state["trial_id"] or mode != state["mode"]:
            return jsonify(error="Stale or inactive trial/mode"), 409
        if kind == "acknowledge" and (mode != "emergency" or state["acknowledged"] or state["alert_issued_at"] is None):
            return jsonify(error="No active unacknowledged emergency"), 409
        category = "progress" if kind == "advance" else "unnecessary"
        if kind == "advance":
            key = "normal_step" if mode == "normal" else "emergency_step"
            max_steps = 7 if mode == "normal" else 6
            if data.get("step") != state[key] or state[key] >= max_steps:
                return jsonify(error="Step already completed or out of order"), 409
            state[key] += 1
        if kind == "acknowledge":
            # Client records time from first observed emergency display to click.
            # This avoids measuring server polling latency as participant response time.
            elapsed = data.get("reaction_time_ms")
            if not isinstance(elapsed, (int, float)) or not (0 <= elapsed <= 3600000):
                return jsonify(error="Invalid reaction time"), 400
            state["reaction_time_ms"] = round(elapsed, 1)
            state["acknowledged"] = True
            category = "response"
        state[f"{mode}_clicks"] += 1
        if category == "progress":
            state["progress_clicks"] += 1
            state[f"{mode}_progress_clicks"] += 1
        elif category == "unnecessary":
            state["unnecessary_clicks"] += 1
            state[f"{mode}_unnecessary_clicks"] += 1
        state["version"] += 1
        log_event(kind, category, state["reaction_time_ms"] if kind == "acknowledge" else None)
        if kind == "acknowledge":
            save_summary()  # Automatically persist the measurement as soon as participant responds.
        return jsonify(snapshot())


@app.post("/api/notes")
def update_notes():
    data = request.get_json(silent=True) or {}
    with lock:
        if not state["trial_id"]:
            return jsonify(error="No experiment exists"), 409
        state["notes"] = str(data.get("notes", ""))[:2000]
        log_event("notes_updated")
        save_summary()
        return jsonify(snapshot())


@app.get("/api/download/<kind>")
def download(kind):
    if kind not in ("events", "summary"):
        return jsonify(error="Invalid export type"), 404
    with lock:
        if not state["trial_id"]:
            return jsonify(error="No trial to export"), 404
        if kind == "summary":
            save_summary()
        filename = f"{state['trial_id']}_{kind}.csv"
        path = os.path.join(DATA_DIR, filename)
        if not os.path.isfile(path):
            return jsonify(error="No data yet"), 404
        with open(path, "rb") as handle:
            content = handle.read()
    return Response(content, mimetype="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


if __name__ == "__main__":
    print("Participant: http://localhost:5001/")
    print("Controller:  http://localhost:5001/control")
    app.run(host="0.0.0.0", port=5001, threaded=True)
