// Toast stack with levels + optional WebAudio chime.
// Kiosk note: Chrome may gate audio until a user gesture; failures are ignored.

let audioCtx = null;

function chime(level) {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const notes =
      level === "critical" ? [880, 660, 880] : level === "warning" ? [660, 520] : [740];
    let t = audioCtx.currentTime;
    for (const freq of notes) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
      t += 0.16;
    }
  } catch {
    /* audio not available — fine */
  }
}

const MAX_TOASTS = 4;

export class Notifications {
  constructor(containerEl) {
    this.container = containerEl;
  }

  /** @param {{id:string,title:string,body?:string,level:string,ttl:number,sound:boolean}} evt */
  show(evt) {
    const el = document.createElement("div");
    el.className = `toast ${evt.level}`;
    el.dataset.id = evt.id;

    const title = document.createElement("div");
    title.className = "t-title";
    title.textContent = `${iconFor(evt.level)} ${evt.title}`;
    el.appendChild(title);

    if (evt.body) {
      const body = document.createElement("div");
      body.className = "t-body";
      body.textContent = evt.body;
      el.appendChild(body);
    }

    this.container.prepend(el);
    while (this.container.children.length > MAX_TOASTS) {
      this.container.lastElementChild.remove();
    }

    if (evt.sound) chime(evt.level);

    setTimeout(() => {
      el.classList.add("leaving");
      el.addEventListener("animationend", () => el.remove(), { once: true });
    }, evt.ttl);
  }
}

function iconFor(level) {
  return level === "critical" ? "🚨" : level === "warning" ? "⚠️" : "💬";
}
