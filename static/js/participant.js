// Participant HUD. All task definitions are editable in tasks.js.
const viewport = document.getElementById("viewport");
const connectionStatus = document.getElementById("connection-status");
const taskLabel = document.getElementById("task-label");
const taskSubtitle = document.getElementById("task-subtitle");
const taskProgress = document.getElementById("task-progress");
const evaTime = document.getElementById("eva-time");
const instructionPanel = document.getElementById("instruction-panel");
const emergencyBanner = document.getElementById("emergency-banner");
const waitingScreen = document.getElementById("waiting-screen");
let currentState = null;
let expanded = false;
let alertFirstSeenAt = null;
let lastAlertId = null;
let pendingInteraction = false;
let experimentStartedAt = performance.now();

function formatTime(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

async function sendInteraction(kind, extra = {}) {
  if (!currentState?.running || pendingInteraction) return;
  pendingInteraction = true;
  try {
    const response = await fetch("/api/interaction", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({kind, mode: currentState.mode, trial_id: currentState.trial_id, ...extra})
    });
    if (!response.ok) throw new Error(`Interaction rejected: ${response.status}`);
    const state = await response.json();
    applyState(state);
  } catch (error) {
    console.warn(error.message);
  } finally {
    pendingInteraction = false;
  }
}

function renderTasks() {
  const mode = currentState.mode;
  const tasks = TASKS[mode];
  const count = currentState[`${mode}_step`];
  const container = document.getElementById(`${mode}-tasks`);
  container.replaceChildren();
  tasks.forEach((task, index) => {
    if (currentState.list_mode === "current" && index !== count) return;
    const done = index < count;
    const active = index === count;
    const item = document.createElement("div");
    item.className = "task-item";
    const row = document.createElement("div");
    row.className = `task-row${done ? " done" : ""}${active ? " active" : ""}`;
    const checkbox = document.createElement("button");
    checkbox.type = "button";
    checkbox.className = "task-check-button";
    checkbox.textContent = done ? "✓" : "";
    checkbox.disabled = !active;
    checkbox.setAttribute("aria-label", `Complete ${task.title}`);
    if (active) checkbox.addEventListener("click", () => sendInteraction("advance", {step: index}));
    row.appendChild(checkbox);
    const prefix = mode === "normal" ? `${index + 1}.` : `E2.${index + 1}`;
    if (active) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "task-expand-button";
      toggle.textContent = `${prefix}  ${task.title}`;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.addEventListener("click", () => {
        expanded = !expanded;
        renderTasks();
        sendInteraction("expand");
      });
      row.appendChild(toggle);
      const arrow = document.createElement("span");
      arrow.className = "chevron";
      arrow.textContent = expanded ? "⌄" : "›";
      row.appendChild(arrow);
    } else {
      const label = document.createElement("span");
      label.className = "task-name";
      label.textContent = `${prefix}  ${task.title}`;
      row.appendChild(label);
    }
    item.appendChild(row);
    if (active && expanded) {
      const details = document.createElement("div");
      details.className = "task-details";
      task.details.forEach((detail, i) => {
        const line = document.createElement("p");
        line.textContent = `${prefix}.${i + 1}  ${detail}`;
        details.appendChild(line);
      });
      item.appendChild(details);
    }
    container.appendChild(item);
  });
}

function applyState(state) {
  const prior = currentState;
  const isNewTrial = !prior || prior.trial_id !== state.trial_id;
  const modeChanged = !prior || prior.mode !== state.mode;
  const stepChanged = prior && prior[`${state.mode}_step`] !== state[`${state.mode}_step`];
  if (isNewTrial) {
    expanded = false;
    experimentStartedAt = performance.now();
    lastAlertId = null;
    alertFirstSeenAt = null;
  }
  if (modeChanged || stepChanged) expanded = false;
  currentState = state;
  viewport.classList.toggle("experiment-inactive", !state.running);
  waitingScreen.hidden = state.running;
  if (!state.running) return;
  const emergency = state.mode === "emergency";
  viewport.dataset.mode = state.mode;
  document.getElementById("normal-tasks").hidden = emergency;
  document.getElementById("emergency-tasks").hidden = !emergency;
  taskLabel.textContent = emergency ? "EMERGENCY SITUATION" : "DEEP SPACE EXPLORER — EVA 3";
  taskSubtitle.textContent = emergency ? "SOLAR ARRAY IMPACT RESPONSE" : "LUBRICATE SOLAR ARRAY GIMBAL";
  const count = state[`${state.mode}_step`];
  const tasks = TASKS[state.mode];
  taskProgress.textContent = count >= tasks.length ? `${count} / ${tasks.length} ✓` : `${count + 1} / ${tasks.length}`;
  const task = tasks[count];
  if (!emergency) {
    instructionPanel.querySelector(".panel-heading").textContent = task ? `STEP ${count + 1}` : "TASK COMPLETE";
    instructionPanel.querySelector(".instruction-title").textContent = task ? task.title : "All tasks completed";
    instructionPanel.querySelector(".instruction-description").textContent = task ? task.details.join(" • ") : "Maintenance checklist complete.";
  }
  if (emergency && (isNewTrial || lastAlertId !== state.alert_id)) {
    // First time the browser actually renders this alert, not when the controller pressed the button.
    alertFirstSeenAt = performance.now();
    lastAlertId = state.alert_id;
  }
  emergencyBanner.disabled = state.acknowledged;
  emergencyBanner.classList.toggle("acknowledged", state.acknowledged);
  emergencyBanner.querySelector(".emergency-hint").textContent = state.acknowledged ? "ALERT ACKNOWLEDGED" : "CLICK TO ACKNOWLEDGE";
  renderTasks();
}

async function pollState() {
  try {
    const response = await fetch("/api/state", {cache: "no-store"});
    if (!response.ok) throw new Error("Disconnected");
    const state = await response.json();
    if (!currentState || state.version !== currentState.version) applyState(state);
    connectionStatus.textContent = "● Controller link active";
  } catch (error) {
    connectionStatus.textContent = "○ Connection lost — retrying";
  }
}

emergencyBanner.addEventListener("click", () => {
  if (!currentState?.running || currentState.mode !== "emergency" || currentState.acknowledged || alertFirstSeenAt === null) return;
  sendInteraction("acknowledge", {reaction_time_ms: Math.round((performance.now() - alertFirstSeenAt) * 10) / 10});
});

// Clicks outside controls are unnecessary interactions; clicks on controls are logged by their handlers.
viewport.addEventListener("click", event => {
  if (!currentState?.running) return;
  if (event.target.closest("button")) return;
  sendInteraction("background");
});

setInterval(() => {
  if (currentState?.running) evaTime.textContent = formatTime(Math.floor((performance.now() - experimentStartedAt) / 1000));
}, 1000);
pollState();
setInterval(pollState, 250);
