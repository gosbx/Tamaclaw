// Show stage: chat-style rich content card (email summary, Slack message,
// news, arbitrary HTML like charts). While a card is on stage the mascot
// shrinks to the bottom-left corner (body.showing, see styles.css).

export class ShowStage {
  /**
   * @param {HTMLElement} el      the #show-stage section
   * @param {(showing: boolean) => void} onToggle  body-class / layout hook
   */
  constructor(el, onToggle) {
    this.el = el;
    this.onToggle = onToggle;
    this.timer = null;
  }

  /** @param {{id:string,icon?:string,title?:string,source?:string,body?:string,html?:string,ttl:number}} evt */
  show(evt) {
    clearTimeout(this.timer);
    this.el.innerHTML = "";

    const card = document.createElement("article");
    card.className = "show-card";

    if (evt.icon || evt.title || evt.source) {
      const head = document.createElement("header");
      head.className = "show-head";
      if (evt.icon) {
        const icon = document.createElement("span");
        icon.className = "show-icon";
        icon.textContent = evt.icon;
        head.appendChild(icon);
      }
      const titles = document.createElement("div");
      titles.className = "show-titles";
      if (evt.title) {
        const h = document.createElement("h1");
        h.textContent = evt.title;
        titles.appendChild(h);
      }
      if (evt.source) {
        const s = document.createElement("span");
        s.className = "show-source";
        s.textContent = evt.source;
        titles.appendChild(s);
      }
      head.appendChild(titles);
      card.appendChild(head);
    }

    const content = document.createElement("div");
    content.className = "show-content";
    if (evt.body) {
      const p = document.createElement("p");
      p.className = "show-body";
      p.textContent = evt.body; // plain text, newlines via CSS white-space
      content.appendChild(p);
    }
    if (evt.html) {
      const box = document.createElement("div");
      box.className = "show-html";
      // innerHTML does not execute <script>; the bridge is a local trusted source
      box.innerHTML = evt.html;
      content.appendChild(box);
    }
    card.appendChild(content);
    this.el.appendChild(card);

    this.el.classList.remove("hidden");
    this.onToggle(true);
    this.timer = setTimeout(() => this.clear(), evt.ttl);
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.el.classList.contains("hidden")) return;
    this.el.classList.add("leaving");
    this.onToggle(false); // mascot heads back to center while the card fades
    setTimeout(() => {
      this.el.classList.add("hidden");
      this.el.classList.remove("leaving");
      this.el.innerHTML = "";
    }, 450);
  }
}
