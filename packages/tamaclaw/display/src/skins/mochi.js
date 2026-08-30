// "Mochi" — kawaii squishy pastel blob.
import { BaseSkin } from "./base.js";

const SVG = `
<svg viewBox="0 0 120 118" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="mochi-g" cx="40%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#ffe3ec"/><stop offset="55%" stop-color="#ffb7cf"/><stop offset="100%" stop-color="#ff8fb5"/>
    </radialGradient>
  </defs>
  <g class="mo-pet">
    <ellipse cx="60" cy="111" rx="34" ry="5" fill="#000" opacity="0.3"/>
    <g class="mo-body">
      <path d="M60,18 C95,18 108,46 106,74 C104,100 88,110 60,110 C32,110 16,100 14,74 C12,46 25,18 60,18 Z" fill="url(#mochi-g)"/>
      <path d="M38,22 q-3,-10 6,-13 M82,22 q3,-10 -6,-13" stroke="#ff8fb5" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="24" cy="88" rx="8" ry="6" fill="#ffb7cf"/>
      <ellipse cx="96" cy="88" rx="8" ry="6" fill="#ffb7cf"/>

      <g class="mo-eyes-open">
        <g class="mo-eye"><circle cx="42" cy="60" r="9" fill="#3b2436"/><circle cx="45" cy="56" r="3.4" fill="#fff"/><circle cx="39.5" cy="62" r="1.7" fill="#fff" opacity="0.85"/></g>
        <g class="mo-eye"><circle cx="78" cy="60" r="9" fill="#3b2436"/><circle cx="81" cy="56" r="3.4" fill="#fff"/><circle cx="75.5" cy="62" r="1.7" fill="#fff" opacity="0.85"/></g>
      </g>
      <g class="mo-eyes-happy" visibility="hidden">
        <path d="M34,60 q8,-9 16,0" stroke="#3b2436" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M70,60 q8,-9 16,0" stroke="#3b2436" stroke-width="4" fill="none" stroke-linecap="round"/>
      </g>
      <g class="mo-eyes-closed" visibility="hidden">
        <path d="M34,62 q8,6 16,0" stroke="#3b2436" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M70,62 q8,6 16,0" stroke="#3b2436" stroke-width="4" fill="none" stroke-linecap="round"/>
      </g>

      <ellipse class="mo-blush" cx="30" cy="70" rx="7" ry="4" fill="#ff5f93" opacity="0.55"/>
      <ellipse class="mo-blush" cx="90" cy="70" rx="7" ry="4" fill="#ff5f93" opacity="0.55"/>

      <path class="mo-mouth" d="M53,72 q3.5,4 7,0 q3.5,4 7,0" stroke="#3b2436" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse class="mo-mouth-talk" cx="60" cy="75" rx="6" ry="1" fill="#3b2436" visibility="hidden"/>
    </g>

    <g class="mo-extra mo-thought" fill="#efeaff">
      <circle cx="92" cy="26" r="3"/><circle cx="100" cy="16" r="4.5"/><circle cx="110" cy="5" r="5.5"/>
    </g>
    <g class="mo-extra mo-alert">
      <circle cx="100" cy="20" r="12" fill="#ff4d5e"/>
      <rect x="98" y="12" width="4" height="10" rx="2" fill="#fff"/>
      <circle cx="100" cy="26.5" r="2.4" fill="#fff"/>
    </g>
    <g class="mo-extra mo-zzz" font-weight="bold" fill="#b9a7c9">
      <text x="90" y="30" font-size="12">z</text>
      <text x="100" y="18" font-size="16">z</text>
      <text x="110" y="6" font-size="19">Z</text>
    </g>
  </g>
</svg>`;

const MOUTHS = {
  idle: "M53,72 q3.5,4 7,0 q3.5,4 7,0", // gatito w
  thinking: "M56,73 q4,-3 8,0",
  happy: "M50,70 q10,10 20,0",
  alert: "M54,75 q6,-5 12,0",
  sleeping: "M54,73 q6,4 12,0",
};

export class MochiSkin extends BaseSkin {
  buildMarkup() {
    return SVG;
  }

  init() {
    super.init();
    this.open = this.root.querySelector(".mo-eyes-open");
    this.happy = this.root.querySelector(".mo-eyes-happy");
    this.closed = this.root.querySelector(".mo-eyes-closed");
    this.mouth = this.root.querySelector(".mo-mouth");
    this.mouthTalk = this.root.querySelector(".mo-mouth-talk");
    this.onMood(this.mood);
    this.scheduleBlink(
      () => this.#setEyes("closed"),
      () => this.#setEyes(this.mood === "happy" ? "happy" : "open"),
    );
    return this;
  }

  #setEyes(which) {
    this.open.setAttribute("visibility", which === "open" ? "visible" : "hidden");
    this.happy.setAttribute("visibility", which === "happy" ? "visible" : "hidden");
    this.closed.setAttribute("visibility", which === "closed" ? "visible" : "hidden");
  }

  onMood(mood) {
    if (!this.mouth) return;
    const talking = mood === "talking";
    this.mouth.setAttribute("visibility", talking ? "hidden" : "visible");
    this.mouthTalk.setAttribute("visibility", talking ? "visible" : "hidden");
    if (!talking) this.mouth.setAttribute("d", MOUTHS[mood] ?? MOUTHS.idle);
    this.#setEyes(mood === "sleeping" ? "closed" : mood === "happy" ? "happy" : "open");
  }

  onAmp(amp) {
    this.mouthTalk.setAttribute("ry", (1 + amp * 6).toFixed(2));
    this.mouthTalk.setAttribute("rx", (5 + amp * 2.5).toFixed(2));
  }
}
