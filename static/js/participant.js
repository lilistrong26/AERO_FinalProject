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
// The participant can toggle the minimal time-only display with Space in normal status.
let minimalView = false;
let audioContext = null;
let alarmTimer = null;

function unlockAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  } catch (error) { console.warn("Audio unavailable:", error); }
}

// Alternating two-tone warning: noticeably louder than the old single soft beep.
// Change ALARM_GAIN to adjust volume (keep below 0.18 for comfort).
const ALARM_GAIN = 0.11;
function playAlarmTone(frequency, delay, duration) {
  if (!audioContext || audioContext.state !== "running") return;
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(ALARM_GAIN, start + 0.015);
  gain.gain.setValueAtTime(ALARM_GAIN, start + duration - 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}
function alarmBeep() {
  if (!currentState?.running || currentState.mode !== "emergency" || currentState.acknowledged) return;
  playAlarmTone(880, 0, 0.22);
  playAlarmTone(660, 0.28, 0.22);
}

function updateAlarm() {
  const shouldRing = currentState?.running && currentState.mode === "emergency" && !currentState.acknowledged;
  if (shouldRing && alarmTimer === null) {
    unlockAudio();
    alarmBeep();
    alarmTimer = setInterval(alarmBeep, 1100);
  } else if (!shouldRing && alarmTimer !== null) {
    clearInterval(alarmTimer);
    alarmTimer = null;
  }
}

document.addEventListener("pointerdown", unlockAudio, {passive: true});
document.addEventListener("keydown", event => {
  if (event.code !== "Space" || event.repeat || !currentState?.running || currentState.mode !== "normal") return;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(document.activeElement?.tagName)) return;
  event.preventDefault();
  unlockAudio();
  minimalView = !minimalView;
  viewport.classList.toggle("minimal-view", minimalView);
});

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
  const tasks = mode === "normal" ? currentState.procedures[currentState.procedure].steps : currentState.emergencies[currentState.emergency_scenario].steps;
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
    const prefix = mode === "normal" ? `${index + 1}.` : `${currentState.emergency_scenario === "pressure" ? "E1" : "E2"}.${index + 1}`;
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
  const stepChanged = prior && (prior[`${state.mode}_step`] !== state[`${state.mode}_step`] || prior.procedure !== state.procedure || prior.emergency_scenario !== state.emergency_scenario);
  if (isNewTrial) {
    expanded = false;
    experimentStartedAt = performance.now();
    lastAlertId = null;
    alertFirstSeenAt = null;
    minimalView = false;
  }
  if (modeChanged || stepChanged) expanded = false;
  currentState = state;
  viewport.classList.toggle("experiment-inactive", !state.running);
  waitingScreen.hidden = state.running;
  if (!state.running) {
    minimalView = false;
    viewport.classList.remove("minimal-view");
    updateAlarm();
    return;
  }
  const emergency = state.mode === "emergency";
  viewport.dataset.mode = state.mode;
  // Emergency always overrides the participant's minimal view.
  if (emergency) minimalView = false;
  viewport.classList.toggle("minimal-view", minimalView && !emergency);
  document.getElementById("emergency-task-copy").hidden = !emergency;
  document.getElementById("normal-tasks").hidden = emergency;
  document.getElementById("emergency-tasks").hidden = !emergency;
  taskLabel.textContent = emergency ? "EMERGENCY SITUATION" : "DEEP SPACE EXPLORER — EVA 3";
  taskSubtitle.textContent = emergency ? state.emergencies[state.emergency_scenario].subtitle : state.procedures[state.procedure].title.toUpperCase();
  document.getElementById("emergency-task-copy").textContent = state.custom_emergency_message || state.emergencies[state.emergency_scenario].message;
  emergencyBanner.querySelector("strong").textContent = emergency ? state.emergencies[state.emergency_scenario].title.toUpperCase() : "EMERGENCY SITUATION";
  const bg = document.getElementById("task-background");
  bg.hidden = !state.background_url;
  if (state.background_url && bg.getAttribute("src") !== state.background_url) bg.src = state.background_url;
  const count = state[`${state.mode}_step`];
  const tasks = emergency ? state.emergencies[state.emergency_scenario].steps : state.procedures[state.procedure].steps;
  taskProgress.textContent = emergency ? "" : (count >= tasks.length ? `${count} / ${tasks.length} ✓` : `${count + 1} / ${tasks.length}`);
  const task = tasks[count];
  if (!emergency) {
    // AR callout identifies the physical object, not the procedure instructions.
    const objects = tasks.map(item => item.object || item.title);
    instructionPanel.querySelector(".panel-heading").textContent = "";
    instructionPanel.querySelector(".instruction-title").textContent = objects[count] || "Solar array gimbal";
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
  updateAlarm();
  requestAnimationFrame(updateObjectArrow);
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
  unlockAudio();
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

// Place the arrow using the real DOM positions rather than guessed CSS angles.
function updateObjectArrow() {
  const circle = document.getElementById("target-circle");
  const svg = document.getElementById("object-arrow");
  const line = document.getElementById("object-arrow-line");
  if (!circle || !svg || !line || !instructionPanel) return;
  if (!currentState?.running || currentState.mode !== "normal" || minimalView) return;

  const view = viewport.getBoundingClientRect();
  const object = circle.getBoundingClientRect();
  const label = instructionPanel.getBoundingClientRect();
  const cx = object.left + object.width / 2;
  const cy = object.top + object.height / 2;
  const radius = Math.min(object.width, object.height) / 2;
  const startX = label.left + Math.min(32, label.width * 0.2);
  const startY = label.bottom;
  const dx = startX - cx;
  const dy = startY - cy;
  const distance = Math.hypot(dx, dy) || 1;
  // Arrow ends at the object boundary, not through the middle of the object.
  const endX = cx + (dx / distance) * (radius + 4);
  const endY = cy + (dy / distance) * (radius + 4);

  svg.setAttribute("viewBox", `0 0 ${view.width} ${view.height}`);
  line.setAttribute("x1", (startX - view.left).toFixed(1));
  line.setAttribute("y1", (startY - view.top).toFixed(1));
  line.setAttribute("x2", (endX - view.left).toFixed(1));
  line.setAttribute("y2", (endY - view.top).toFixed(1));
}
window.addEventListener("resize", () => requestAnimationFrame(updateObjectArrow));
requestAnimationFrame(updateObjectArrow);
