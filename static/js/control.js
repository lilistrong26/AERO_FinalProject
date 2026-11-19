// Experimenter hub: start/stop trials, trigger alerts, view live metrics, export CSV.
const $ = id => document.getElementById(id);
let latestState = null;
let busy = false;

async function post(path, body = {}) {
  const response = await fetch(path, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

function render(state) {
  latestState = state;
  $("server-status").textContent = "● Connected";
  $("current-mode").textContent = state.running ? state.mode.toUpperCase() : "NOT RUNNING";
  $("trial-status").textContent = state.running ? "Experiment running" : "Experiment stopped";
  $("trial-id").textContent = state.trial_id || "—";
  $("start-button").disabled = state.running || busy;
  $("stop-button").disabled = !state.running || busy;
  $("normal-button").disabled = !state.running || busy;
  $("emergency-button").disabled = !state.running || busy || state.mode === "emergency";
  $("participant-name").disabled = state.running;
  $("experiment-date").disabled = state.running;
  document.querySelectorAll('input[name="list_mode"]').forEach(input => input.disabled = state.running);
  $("normal-clicks").textContent = state.normal_clicks;
  $("emergency-clicks").textContent = state.emergency_clicks;
  $("total-clicks").textContent = state.normal_clicks + state.emergency_clicks;
  $("progress-clicks").textContent = state.progress_clicks;
  $("unnecessary-clicks").textContent = state.unnecessary_clicks;
  $("normal-progress").textContent = state.normal_progress_clicks;
  $("emergency-progress").textContent = state.emergency_progress_clicks;
  $("normal-unnecessary").textContent = state.normal_unnecessary_clicks;
  $("emergency-unnecessary").textContent = state.emergency_unnecessary_clicks;
  $("reaction-time").textContent = state.reaction_time_ms == null ? "—" : `${state.reaction_time_ms} ms`;
  $("ack-status").textContent = state.mode === "emergency" ? (state.acknowledged ? "Acknowledged" : "Awaiting response") : "—";
  $("alert-count").textContent = state.alert_count;
  $("export-events").disabled = !state.trial_id;
  $("export-summary").disabled = !state.trial_id;
}

async function runAction(path, payload, message) {
  if (busy) return;
  busy = true;
  try {
    const state = await post(path, payload);
    render(state);
    $("feedback").textContent = message;
  } catch (error) {
    $("feedback").textContent = `Error: ${error.message}`;
  } finally {
    busy = false;
    if (latestState) render(latestState);
  }
}

$("start-button").addEventListener("click", () => {
  const listMode = document.querySelector('input[name="list_mode"]:checked').value;
  runAction("/api/start", {
    participant: $("participant-name").value,
    date: $("experiment-date").value,
    notes: $("experiment-notes").value,
    list_mode: listMode
  }, "Experiment started in NORMAL mode. Participant display is now visible.");
});
$("stop-button").addEventListener("click", () => runAction("/api/stop", {}, "Experiment stopped. CSV files saved in data/."));
$("normal-button").addEventListener("click", () => runAction("/api/mode", {mode: "normal"}, "Normal mode selected."));
$("emergency-button").addEventListener("click", () => runAction("/api/mode", {mode: "emergency"}, "Emergency triggered. Awaiting participant acknowledgement."));
$("save-notes").addEventListener("click", () => runAction("/api/notes", {notes: $("experiment-notes").value}, "Notes saved to trial CSV."));
$("export-events").addEventListener("click", () => {window.location.href = "/api/download/events";});
$("export-summary").addEventListener("click", () => {window.location.href = "/api/download/summary";});

$("experiment-date").value = new Date().toLocaleDateString("en-CA");
async function poll() {
  try {
    const response = await fetch("/api/state", {cache: "no-store"});
    if (!response.ok) throw new Error();
    const state = await response.json();
    if (!busy) render(state);
  } catch (_) {
    $("server-status").textContent = "○ Disconnected";
  }
}
poll();
setInterval(poll, 500);
