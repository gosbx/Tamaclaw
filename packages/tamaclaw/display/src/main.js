import { SKIN_REGISTRY, DEFAULT_SKIN } from "./skins/index.js";
import { Notifications } from "./notifications.js";
import { Dashboard } from "./dashboard.js";
import { ShowStage } from "./show.js";

// Protocol: see packages/shared/src/index.ts (ServerEvent).

const SLEEP_AFTER_MS = 3 * 60 * 1000; // pet dozes off when nothing happens
const REVERT_MS = 8000; // happy/alert fade back to idle
const SKIN_KEY = "tamaclaw-skin";

// ------------------------------------------------------------------- skins

const characterRoot = document.getElementById("character-root");
let character = null;
let currentSkin = null;

function setSkin(name, { persist = false } = {}) {
  if (!SKIN_REGISTRY[name]) return;
  if (name !== currentSkin) {
    const mood = character?.mood ?? "idle";
    character?.destroy();
    currentSkin = name;
    characterRoot.className = `skin-${name}`;
    character = new SKIN_REGISTRY[name].Skin(characterRoot).init();
    character.setMood(mood);
    refreshPickerActive();
  }
  if (persist) {
    try {
      localStorage.setItem(SKIN_KEY, name);
    } catch {
      /* storage unavailable — skin just won't survive reloads */
    }
  }
}
const notifications = new Notifications(document.getElementById("toasts"));
const dashboard = new Dashboard(
  document.getElementById("dashboard"),
  document.getElementById("widget-slot"),
  document.getElementById("widget-dots"),
);

const showStage = new ShowStage(document.getElementById("show-stage"), (showing) => {
  document.body.classList.toggle("showing", showing);
});

const bubble = document.getElementById("speech-bubble");
const bubbleText = document.getElementById("speech-text");
const connDot = document.getElementById("conn-dot");
const connLabel = document.getElementById("conn-label");

// ---------------------------------------------------------------- mood mgmt

let revertTimer = null;
let sleepTimer = null;
let speaking = false;
// Where transient moods (happy/alert, post-speech) settle back to. Stays
// "thinking" while the agent works so an alert toast doesn't reset it.
let stickyMood = "idle";

function setMood(mood, { autoRevert = false } = {}) {
  clearTimeout(revertTimer);
  if (!autoRevert && mood !== "talking") stickyMood = mood === "sleeping" ? "idle" : mood;
  character.setMood(mood);
  if (autoRevert) {
    revertTimer = setTimeout(() => {
      if (!speaking) character.setMood(stickyMood);
    }, REVERT_MS);
  }
}

function armSleepTimer() {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    if (!speaking) setMood("sleeping");
  }, SLEEP_AFTER_MS);
}

function wake() {
  if (character.mood === "sleeping") setMood("idle");
  armSleepTimer();
}

// -------------------------------------------------------------- event route

function handleEvent(evt) {
  if (evt.type !== "hello") wake();
  switch (evt.type) {
    case "hello":
      break;
    case "say:start": {
      speaking = true;
      bubbleText.textContent = evt.text;
      bubble.classList.remove("hidden");
      setMood("talking");
      // remember the requested mood for when the utterance ends
      handleEvent.pendingMood = evt.mood !== "talking" ? evt.mood : null;
      break;
    }
    case "say:end": {
      speaking = false;
      bubble.classList.add("hidden");
      const after = handleEvent.pendingMood;
      handleEvent.pendingMood = null;
      if (after && after !== "idle") setMood(after, { autoRevert: true });
      else character.setMood(stickyMood);
      break;
    }
    case "notify": {
      notifications.show(evt);
      if (!speaking && (evt.level === "warning" || evt.level === "critical")) {
        setMood("alert", { autoRevert: true });
      }
      break;
    }
    case "dashboard":
      dashboard.upsert(evt);
      break;
    case "mood":
      if (!speaking) {
        setMood(evt.value, { autoRevert: evt.value === "happy" || evt.value === "alert" });
      }
      break;
    case "skin":
      setSkin(evt.value, { persist: true });
      break;
    case "show":
      showStage.show(evt);
      break;
    case "show:clear":
      showStage.clear();
      break;
  }
}

// ----------------------------------------------------------------- ws client

let ws = null;
let retryMs = 1000;

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    retryMs = 1000;
    connDot.className = "dot online";
    connLabel.textContent = "conectado";
    wake();
  };

  ws.onmessage = (msg) => {
    try {
      handleEvent(JSON.parse(msg.data));
    } catch (err) {
      console.error("bad event", err, msg.data);
    }
  };

  ws.onclose = () => {
    connDot.className = "dot offline";
    connLabel.textContent = "sin conexión";
    speaking = false;
    bubble.classList.add("hidden");
    setMood("sleeping"); // the pet naps until the bridge is back
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 1.7, 15000);
  };

  ws.onerror = () => ws.close();
}

// -------------------------------------------------------------------- clock

const clock = document.getElementById("clock");
function tickClock() {
  clock.textContent = new Date().toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
setInterval(tickClock, 10_000);
tickClock();

// ------------------------------------------------------------- skin picker

const picker = document.getElementById("skin-picker");
const pickerRow = document.getElementById("sp-row");

for (const [name, def] of Object.entries(SKIN_REGISTRY)) {
  const btn = document.createElement("button");
  btn.className = "sp-btn";
  btn.dataset.skin = name;
  btn.innerHTML = `<span class="sp-emoji">${def.emoji}</span><span>${def.label}</span><span class="sp-tag">${def.tag}</span>`;
  btn.addEventListener("click", () => setSkin(name)); // live preview
  pickerRow.appendChild(btn);
}

function refreshPickerActive() {
  for (const btn of pickerRow?.children ?? []) {
    btn.classList.toggle("active", btn.dataset.skin === currentSkin);
  }
}

function openPicker() {
  picker.classList.remove("hidden");
  document.body.classList.add("picker-open");
  refreshPickerActive();
}

function closePicker() {
  picker.classList.add("hidden");
  document.body.classList.remove("picker-open");
}

document.getElementById("sp-confirm").addEventListener("click", () => {
  setSkin(currentSkin, { persist: true });
  closePicker();
});
document.getElementById("skin-gear").addEventListener("click", openPicker);
document.addEventListener("keydown", (e) => {
  if (e.key === "s") openPicker();
  if (e.key === "Escape") closePicker();
  const idx = Number(e.key) - 1;
  const names = Object.keys(SKIN_REGISTRY);
  if (!picker.classList.contains("hidden") && names[idx]) setSkin(names[idx]);
  if (e.key === "Enter" && !picker.classList.contains("hidden")) {
    setSkin(currentSkin, { persist: true });
    closePicker();
  }
});

// ----------------------------------------------------------------- startup

let savedSkin = null;
try {
  savedSkin = localStorage.getItem(SKIN_KEY);
} catch {
  /* ignore */
}
setSkin(savedSkin && SKIN_REGISTRY[savedSkin] ? savedSkin : DEFAULT_SKIN);
if (!savedSkin) openPicker(); // first run → setup inicial

armSleepTimer();
connect();
