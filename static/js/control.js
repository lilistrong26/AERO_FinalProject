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
    list_mode: listMode,
    procedure: $("procedure-select").value, emergency_scenario: $("emergency-select").value, custom_emergency_message: $("custom-emergency-message").value
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

// Configurable tasks, emergency scenarios, and background image uploads.
let lastConfigSignature = "";
function fillOptions(select, tasks, includeComplete = false) {
  const previous = select.value;
  select.replaceChildren();
  tasks.forEach((task, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `${i + 1}. ${task.title}`;
    select.appendChild(option);
  });
  if (includeComplete) {
    const option = document.createElement("option");
    option.value = String(tasks.length);
    option.textContent = "Procedure complete";
    select.appendChild(option);
  }
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
}
function selectedTasks(group, state) {
  const key = group === "procedures" ? $("procedure-select").value : $("emergency-select").value;
  return state?.[group]?.[key]?.steps || [];
}
function updateEditFields() {
  if (!latestState) return;
  const group = $("edit-group").value;
  const tasks = selectedTasks(group, latestState);
  fillOptions($("edit-step"), tasks);
  showEditFields();
}
function showEditFields() {
  const group = $("edit-group").value;
  const task = selectedTasks(group, latestState)[Number($("edit-step").value)];
  if (!task) return;
  $("edit-title").value = task.title;
  $("edit-object").value = task.object || "";
  $("edit-details").value = task.details.join("\n");
}
function refreshTaskControls(state) {
  const signature = JSON.stringify([state.procedures, state.emergencies, $("procedure-select").value, $("emergency-select").value]);
  if (signature !== lastConfigSignature) {
    fillOptions($("normal-step-select"), selectedTasks("procedures", state), true);
    fillOptions($("emergency-step-select"), selectedTasks("emergencies", state), true);
    updateEditFields();
    lastConfigSignature = signature;
  }
  if (document.activeElement !== $("normal-step-select")) $("normal-step-select").value = String(state.normal_step);
  if (document.activeElement !== $("emergency-step-select")) $("emergency-step-select").value = String(state.emergency_step);
}
const originalRender = render;
render = function(state) {
  originalRender(state);
  refreshTaskControls(state);
};
$("procedure-select").addEventListener("change", () => {if(latestState) refreshTaskControls(latestState);});
$("emergency-select").addEventListener("change", () => {if(latestState) refreshTaskControls(latestState);});
$("edit-group").addEventListener("change", updateEditFields);
$("edit-step").addEventListener("change", showEditFields);
$("apply-config").addEventListener("click", () => runAction("/api/configure", {
  procedure: $("procedure-select").value, emergency_scenario: $("emergency-select").value,
  list_mode: document.querySelector('input[name="list_mode"]:checked').value,
  custom_emergency_message: $("custom-emergency-message").value
}, "Display configuration updated."));
$("apply-normal-step").addEventListener("click", () => runAction("/api/step", {mode:"normal",step:Number($("normal-step-select").value)}, "Nominal step updated."));
$("apply-emergency-step").addEventListener("click", () => runAction("/api/step", {mode:"emergency",step:Number($("emergency-step-select").value)}, "Emergency step updated."));
$("save-task").addEventListener("click", () => {
  const group = $("edit-group").value;
  runAction("/api/edit-task", {group, key:group === "procedures" ? $("procedure-select").value : $("emergency-select").value,
    step:Number($("edit-step").value), title:$("edit-title").value,
    object:$("edit-object").value, details:$("edit-details").value.split("\n").map(v=>v.trim()).filter(Boolean)}, "Task instructions saved.");
});
$("upload-image").addEventListener("click", async () => {
  const file = $("task-image").files[0];
  if (!file) {$("image-status").textContent="Select an image first.";return;}
  const group = $("edit-group").value;
  const data = new FormData();
  data.append("group",group);
  data.append("key",group === "procedures" ? $("procedure-select").value : $("emergency-select").value);
  data.append("step",$("edit-step").value);
  data.append("image",file);
  $("image-status").textContent="Uploading…";
  try {
    const response = await fetch("/api/upload-image", {method:"POST",body:data});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed");
    render(result);
    $("image-status").textContent="Image uploaded and saved on the host computer.";
  } catch(error) {$("image-status").textContent=`Upload error: ${error.message}`;}
});
