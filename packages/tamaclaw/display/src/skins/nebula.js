// "Nebula" — glowing AI orb. Talking shows an equalizer mouth driven by amp.
import { BaseSkin } from "./base.js";

export class NebulaSkin extends BaseSkin {
  buildMarkup() {
    return `
      <div class="orb-wrap">
        <div class="orb"></div>
        <div class="orb-red"></div>
        <div class="n-eye l"></div>
        <div class="n-eye r"></div>
        <div class="n-bars"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="spark s1"></div><div class="spark s2"></div><div class="spark s3"></div>
        <div class="n-extra n-zzz">z&nbsp;z&nbsp;Z</div>
        <div class="n-extra n-alert">!</div>
        <div class="n-extra n-dots"><span></span><span></span><span></span></div>
      </div>`;
  }

  init() {
    super.init();
    this.eyes = [...this.root.querySelectorAll(".n-eye")];
    this.bars = [...this.root.querySelectorAll(".n-bars i")];
    this.scheduleBlink(
      () => this.#eyes(0.08, 70),
      () => this.#eyes(1, 90),
    );
    return this;
  }

  #eyes(scaleY, ms) {
    for (const e of this.eyes) {
      e.style.transition = `transform ${ms}ms ease`;
      e.style.transform = `scaleY(${scaleY})`;
    }
  }

  onMood(mood) {
    if (!this.eyes) return;
    this.#eyes(mood === "sleeping" ? 0.08 : 1, 400);
  }

  onAmp(amp) {
    // equalizer bars: center bar follows amp, neighbors trail
    const shape = [0.45, 0.75, 1, 0.75, 0.45];
    this.bars.forEach((b, i) => {
      b.style.height = `${3 + amp * 22 * shape[i]}px`;
    });
  }
}
