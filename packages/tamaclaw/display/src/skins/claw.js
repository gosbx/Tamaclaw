// "Claw" — the original v1 coral blob with a little claw.
// Its mood CSS lives in styles.css (id-scoped, so it only affects this markup).
import { BaseSkin } from "./base.js";

const SVG = `
<svg viewBox="0 0 200 210" xmlns="http://www.w3.org/2000/svg" aria-label="Tamaclaw">
  <defs>
    <radialGradient id="body-grad" cx="38%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#ff8a70"/>
      <stop offset="60%" stop-color="#ff6b57"/>
      <stop offset="100%" stop-color="#d94430"/>
    </radialGradient>
    <radialGradient id="belly-grad" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#ffd9c4"/>
      <stop offset="100%" stop-color="#ffb59a"/>
    </radialGradient>
  </defs>

  <g id="pet">
    <ellipse cx="100" cy="196" rx="52" ry="9" fill="#000" opacity="0.35"/>

    <g id="claw">
      <path d="M150,130 Q172,126 176,112" fill="none" stroke="#d94430" stroke-width="11" stroke-linecap="round"/>
      <g id="pincer">
        <path d="M176,112 q-16,-16 -2,-30 q16,-10 24,4 q5,10 -4,16 l-8,-6 q4,-5 -1,-9 q-7,-4 -11,4 q-3,8 8,15 z" fill="#ff6b57" stroke="#b23422" stroke-width="2" stroke-linejoin="round"/>
        <path d="M178,114 q14,4 22,-4" fill="none" stroke="#b23422" stroke-width="2" stroke-linecap="round"/>
      </g>
    </g>

    <g id="body-group">
      <path id="body" fill="url(#body-grad)" stroke="#b23422" stroke-width="3"
        d="M100,28
           C138,28 160,58 160,104
           C160,152 138,192 100,192
           C62,192 40,152 40,104
           C40,58 62,28 100,28 Z"/>
      <path d="M100,28 q-2,-12 8,-16" fill="none" stroke="#b23422" stroke-width="4" stroke-linecap="round"/>
      <circle cx="110" cy="10" r="5" fill="#ffc24b" stroke="#b23422" stroke-width="2"/>

      <ellipse cx="100" cy="150" rx="34" ry="28" fill="url(#belly-grad)" opacity="0.9"/>

      <g id="face">
        <g id="eye-l">
          <circle cx="78" cy="96" r="13" fill="#fff"/>
          <circle class="pupil" cx="80" cy="98" r="6.5" fill="#1d1a30"/>
          <circle cx="83" cy="94" r="2.2" fill="#fff"/>
          <rect class="eyelid" x="63" y="81" width="30" height="30" rx="15" fill="#ff6b57" transform="scale(1,0)" style="transform-origin:78px 96px"/>
        </g>
        <g id="eye-r">
          <circle cx="124" cy="96" r="13" fill="#fff"/>
          <circle class="pupil" cx="126" cy="98" r="6.5" fill="#1d1a30"/>
          <circle cx="129" cy="94" r="2.2" fill="#fff"/>
          <rect class="eyelid" x="109" y="81" width="30" height="30" rx="15" fill="#ff6b57" transform="scale(1,0)" style="transform-origin:124px 96px"/>
        </g>
        <ellipse id="blush-l" cx="68" cy="118" rx="8" ry="4.5" fill="#ff3d6e" opacity="0"/>
        <ellipse id="blush-r" cx="134" cy="118" rx="8" ry="4.5" fill="#ff3d6e" opacity="0"/>

        <path id="mouth" d="M88,126 Q101,133 114,126" fill="none" stroke="#7a1f12" stroke-width="4" stroke-linecap="round"/>
        <ellipse id="mouth-talk" cx="101" cy="129" rx="9" ry="1" fill="#7a1f12" visibility="hidden"/>
      </g>
    </g>

    <g id="thought" fill="#efeaff">
      <circle cx="146" cy="58" r="3"/>
      <circle cx="156" cy="46" r="4.5"/>
      <circle cx="169" cy="32" r="6.5"/>
    </g>

    <g id="alert-badge">
      <circle cx="158" cy="48" r="15" fill="#ff4d5e" stroke="#8f1020" stroke-width="2.5"/>
      <rect x="155.5" y="38" width="5" height="13" rx="2.5" fill="#fff"/>
      <circle cx="158" cy="56.5" r="3" fill="#fff"/>
    </g>

    <g id="zzz" font-family="inherit" font-weight="bold" fill="#8d86ad">
      <text x="140" y="60" font-size="14">z</text>
      <text x="152" y="44" font-size="18">z</text>
      <text x="166" y="26" font-size="23">Z</text>
    </g>
  </g>
</svg>`;

const MOUTHS = {
  idle: "M88,126 Q101,133 114,126",
  thinking: "M92,129 Q101,126 110,129",
  happy: "M84,123 Q101,142 118,123",
  alert: "M92,131 Q101,124 110,131",
  sleeping: "M92,129 Q101,134 110,129",
};

export class ClawSkin extends BaseSkin {
  buildMarkup() {
    return SVG;
  }

  init() {
    super.init();
    this.mouth = this.root.querySelector("#mouth");
    this.mouthTalk = this.root.querySelector("#mouth-talk");
    this.eyelids = [...this.root.querySelectorAll(".eyelid")];
    this.onMood(this.mood);
    this.scheduleBlink(
      () => this.#lids(true, 70),
      () => this.#lids(false, 90),
    );
    return this;
  }

  #lids(closed, ms) {
    for (const lid of this.eyelids) {
      lid.style.transition = `transform ${ms}ms ease`;
      lid.style.transform = closed ? "scale(1,1)" : "scale(1,0)";
    }
  }

  onMood(mood) {
    if (!this.mouth) return;
    const talking = mood === "talking";
    this.mouth.setAttribute("visibility", talking ? "hidden" : "visible");
    this.mouthTalk.setAttribute("visibility", talking ? "visible" : "hidden");
    if (!talking) this.mouth.setAttribute("d", MOUTHS[mood] ?? MOUTHS.idle);

    for (const lid of this.eyelids) {
      lid.style.transition = "transform 400ms ease";
      lid.style.transform = mood === "sleeping" ? "scale(1,1)" : "scale(1,0)";
    }
  }

  onAmp(amp) {
    this.mouthTalk.setAttribute("ry", (1.5 + amp * 8).toFixed(2));
    this.mouthTalk.setAttribute("rx", (7 + amp * 3).toFixed(2));
  }
}
