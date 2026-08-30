// Dashboard widget carousel. One widget visible at a time; if several are
// live it rotates. Unpinned widgets expire after their ttl; pinned ones stay.

const PALETTE = ["#3ddad0", "#ff6b57", "#ffc24b", "#4da3ff", "#b48cff", "#7ce68a"];
const ROTATE_MS = 9000;

/** Accepts [{label, value}] or {labels, series:[{label?, values}]}. */
function normalize(data) {
  if (Array.isArray(data)) {
    return {
      labels: data.map((d) => d?.label ?? ""),
      series: [{ label: undefined, values: data.map((d) => Number(d?.value ?? 0)) }],
    };
  }
  return {
    labels: data.labels ?? [],
    series: (data.series ?? []).map((s) => ({ label: s.label, values: s.values ?? [] })),
  };
}

function chartConfig(evt) {
  const { labels, series } = normalize(evt.data);
  const circular = evt.chart === "pie" || evt.chart === "doughnut";
  const datasets = series.map((s, i) => ({
    label: s.label,
    data: s.values,
    backgroundColor: circular
      ? labels.map((_, j) => PALETTE[j % PALETTE.length])
      : PALETTE[i % PALETTE.length] + (evt.chart === "line" ? "33" : "cc"),
    borderColor: circular ? "#1c1930" : PALETTE[i % PALETTE.length],
    borderWidth: 2,
    fill: evt.chart === "line",
    tension: 0.35,
    pointRadius: 2.5,
    borderRadius: evt.chart === "bar" ? 5 : 0,
  }));

  return {
    type: evt.chart,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: {
          display: circular || series.length > 1,
          labels: { color: "#8d86ad", boxWidth: 12, font: { size: 10 } },
          position: circular ? "right" : "top",
        },
      },
      scales: circular
        ? {}
        : {
            x: { ticks: { color: "#8d86ad", font: { size: 10 } }, grid: { color: "#2e2a4d55" } },
            y: { ticks: { color: "#8d86ad", font: { size: 10 } }, grid: { color: "#2e2a4d55" } },
          },
    },
  };
}

export class Dashboard {
  constructor(asideEl, slotEl, dotsEl) {
    this.aside = asideEl;
    this.slot = slotEl;
    this.dots = dotsEl;
    this.widgets = new Map(); // id -> { evt, expiresAt }
    this.activeId = null;
    this.chart = null;
    setInterval(() => this.#tick(), 1000);
    setInterval(() => this.#rotate(), ROTATE_MS);
  }

  /** @param {{widget:string,chart:string,title:string,data:any,pin:boolean,ttl:number}} evt */
  upsert(evt) {
    this.widgets.set(evt.widget, {
      evt,
      expiresAt: evt.pin ? null : Date.now() + evt.ttl,
    });
    this.#show(evt.widget); // a fresh widget takes the stage
    this.#render();
  }

  #tick() {
    const now = Date.now();
    let changed = false;
    for (const [id, w] of this.widgets) {
      if (w.expiresAt !== null && w.expiresAt <= now) {
        this.widgets.delete(id);
        changed = true;
      }
    }
    if (changed) {
      if (!this.widgets.has(this.activeId)) this.activeId = this.widgets.keys().next().value ?? null;
      this.#render();
    }
  }

  #rotate() {
    if (this.widgets.size < 2) return;
    const ids = [...this.widgets.keys()];
    const next = ids[(ids.indexOf(this.activeId) + 1) % ids.length];
    this.#show(next);
    this.#render();
  }

  #show(id) {
    this.activeId = id;
  }

  #render() {
    const hasWidgets = this.widgets.size > 0;
    this.aside.classList.toggle("hidden", !hasWidgets);
    this.dots.innerHTML = "";
    if (!hasWidgets) {
      this.#destroyChart();
      this.slot.innerHTML = "";
      return;
    }

    for (const id of this.widgets.keys()) {
      const dot = document.createElement("span");
      dot.className = "wdot" + (id === this.activeId ? " active" : "");
      this.dots.appendChild(dot);
    }

    const w = this.widgets.get(this.activeId);
    if (!w) return;

    this.#destroyChart();
    this.slot.innerHTML = "";
    const card = document.createElement("div");
    card.className = "widget-card";
    const h = document.createElement("h2");
    h.textContent = w.evt.title;
    if (w.evt.pin) {
      const pin = document.createElement("span");
      pin.className = "pin";
      pin.textContent = "📌";
      h.prepend(pin);
    }
    const holder = document.createElement("div");
    holder.className = "chart-holder";
    const canvas = document.createElement("canvas");
    holder.appendChild(canvas);
    card.append(h, holder);
    this.slot.appendChild(card);

    // Chart.js is loaded globally from /vendor/chart.umd.js
    this.chart = new window.Chart(canvas, chartConfig(w.evt));
  }

  #destroyChart() {
    this.chart?.destroy();
    this.chart = null;
  }
}
