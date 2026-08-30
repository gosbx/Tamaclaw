// Base class for mascot skins. A skin owns its markup inside `root` and
// reacts to the shared mood machine. Subclasses implement:
//   buildMarkup()        -> innerHTML string (called by init())
//   onMood(mood)         -> adjust skin-specific visuals (optional)
//   onAmp(amp)           -> drive the mouth while talking, amp in [0,1] (optional)
// Mood CSS classes (mood-idle … mood-sleeping) are toggled on `root`
// automatically, scoped in skins.css under .skin-<name>.

export const MOODS = ["idle", "thinking", "talking", "happy", "alert", "sleeping"];

export class BaseSkin {
  constructor(root) {
    this.root = root;
    this.mood = "idle";
    this.dead = false;
    this.timers = new Set();
    this.raf = null;
  }

  init() {
    this.root.innerHTML = this.buildMarkup();
    this.setMood("idle");
    return this;
  }

  after(ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.dead) fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  setMood(mood) {
    if (!MOODS.includes(mood) || this.dead) return;
    this.mood = mood;
    for (const m of MOODS) this.root.classList.toggle(`mood-${m}`, m === mood);
    if (mood === "talking") this.#startTalkLoop();
    else this.#stopTalkLoop();
    this.onMood?.(mood);
  }

  // Pseudo-amplitude while talking (real amplitude events can plug in later).
  #startTalkLoop() {
    if (this.raf || !this.onAmp) return;
    const tick = (t) => {
      const s = t / 1000;
      const amp = Math.max(
        0,
        Math.min(1, 0.5 + 0.5 * Math.sin(s * 13.7) * Math.sin(s * 7.3) + 0.18 * Math.sin(s * 31)),
      );
      this.onAmp(amp);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  #stopTalkLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  /** Random blink loop; skips while sleeping. */
  scheduleBlink(close, open, closedMs = 110) {
    const loop = () => {
      if (this.dead) return;
      if (this.mood !== "sleeping") {
        close();
        this.after(closedMs, () => {
          if (this.mood !== "sleeping") open();
        });
      }
      this.after(1800 + Math.random() * 3800, loop);
    };
    this.after(1500, loop);
  }

  destroy() {
    this.dead = true;
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers.clear();
    this.#stopTalkLoop();
    this.root.innerHTML = "";
    this.root.className = "";
  }
}
