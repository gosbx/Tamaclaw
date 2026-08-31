// "Pixa" — retro pixel-art crab-lobster with CRT scanlines and chunky lip-sync.
import { BaseSkin } from "./base.js";

const MAP = [
  "..o..........o..",
  "..o..........o..",
  "...rrrrrrrrrr...",
  "..rrrrrrrrrrrr..",
  ".rrWWrrrrrrWWrr.",
  ".rrWBrrrrrrWBrr.",
  ".rrrrrrrrrrrrrr.",
  ".rrrrrrrrrrrrrr.",
  "..rrrrrrrrrrrr..",
  "C...rrrrrrrr...C",
  "CC..rrrrrrrr..CC",
  ".C....r..r....C.",
];
const COLORS = { o: "#ffc24b", r: "#ff4d5e", d: "#a81e3c", W: "#ffffff", B: "#1d1a30", C: "#d92b55" };

function px(x, y, c, cls = "") {
  return `<rect ${cls ? `class="${cls}" ` : ""}x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
}

function buildBody() {
  let rects = "";
  let lids = "";
  MAP.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (COLORS[ch]) rects += px(x, y, COLORS[ch]);
      if (ch === "W" || ch === "B") lids += px(x, y, COLORS.r);
    }),
  );
  return { rects, lids };
}

export class PixaSkin extends BaseSkin {
  buildMarkup() {
    const { rects, lids } = buildBody();
    // mouth zone: closed = 1px line, open = chunky 2-row hole
    const mouthClosed = [5, 6, 7, 8, 9, 10].map((x) => px(x, 7, COLORS.d)).join("");
    const mouthOpen =
      [5, 6, 7, 8, 9, 10].map((x) => px(x, 7, COLORS.d)).join("") +
      [6, 7, 8, 9].map((x) => px(x, 8, COLORS.d)).join("");
    const dots = [6, 8, 10].map((x, i) => px(x, 0, "#efeaff", `px-dot px-dot-${i}`)).join("");
    const alert = [px(14, 0, "#ffffff"), px(14, 1, "#ffffff"), px(14, 3, "#ffffff")].join("");
    const zzz = `<text x="12" y="2" font-size="3" fill="#8d86ad">z</text><text x="13.5" y="1.2" font-size="2.4" fill="#8d86ad">z</text>`;
    const hearts = `<g class="px-heart px-h1">${px(1, 1, "#ff5f93")}${px(3, 1, "#ff5f93")}${px(1, 2, "#ff5f93")}${px(2, 2, "#ff5f93")}${px(3, 2, "#ff5f93")}${px(2, 3, "#ff5f93")}</g>`;

    return `
      <div class="px-stage">
        <svg viewBox="-1 -1 18 14" shape-rendering="crispEdges">
          <g class="px-pet">
            ${rects}
            <g class="px-mouth-closed">${mouthClosed}</g>
            <g class="px-mouth-open" visibility="hidden">${mouthOpen}</g>
            <g class="px-eyelid" visibility="hidden">${lids}</g>
            <g class="px-extra px-dots">${dots}</g>
            <g class="px-extra px-alert">${alert}</g>
            <g class="px-extra px-zzz">${zzz}</g>
            ${hearts}
          </g>
        </svg>
        <div class="px-scan"></div>
      </div>`;
  }

  init() {
    super.init();
    this.lid = this.root.querySelector(".px-eyelid");
    this.mClosed = this.root.querySelector(".px-mouth-closed");
    this.mOpen = this.root.querySelector(".px-mouth-open");
    this.mouthOpen = false;
    this.scheduleBlink(
      () => this.lid.setAttribute("visibility", "visible"),
      () => this.lid.setAttribute("visibility", "hidden"),
      140,
    );
    return this;
  }

  onMood(mood) {
    if (!this.lid) return;
    this.lid.setAttribute("visibility", mood === "sleeping" ? "visible" : "hidden");
    if (mood !== "talking") this.#mouth(false);
  }

  #mouth(open) {
    if (open === this.mouthOpen) return;
    this.mouthOpen = open;
    this.mOpen.setAttribute("visibility", open ? "visible" : "hidden");
    this.mClosed.setAttribute("visibility", open ? "hidden" : "visible");
  }

  onAmp(amp) {
    this.#mouth(amp > 0.45); // chunky two-frame lip-sync, very retro
  }
}
