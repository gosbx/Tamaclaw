// "Holo" — Y2K iridescent ghost with flowing chrome gradient.
import { BaseSkin } from "./base.js";

export class HoloSkin extends BaseSkin {
  buildMarkup() {
    return `
      <div class="holo-wrap">
        <div class="holo"></div>
        <div class="holo-red"></div>
        <div class="h-eye l"></div>
        <div class="h-eye r"></div>
        <div class="h-eye-happy l">◡</div>
        <div class="h-eye-happy r">◡</div>
        <div class="h-mouth"></div>
        <div class="h-mouth-talk"></div>
        <span class="star t1">✦</span><span class="star t2">✦</span>
        <div class="h-extra h-zzz">z&nbsp;z&nbsp;Z</div>
        <div class="h-extra h-alert">!</div>
        <div class="h-extra h-dots"><span></span><span></span><span></span></div>
      </div>`;
  }

  init() {
    super.init();
    this.eyes = [...this.root.querySelectorAll(".h-eye")];
    this.mouthTalk = this.root.querySelector(".h-mouth-talk");
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
    this.mouthTalk.style.height = `${3 + amp * 14}px`;
    this.mouthTalk.style.width = `${12 + amp * 6}px`;
  }
}
