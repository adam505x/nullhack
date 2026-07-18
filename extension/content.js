// Artemator launcher: a floating genie button on Uniqlo pages that opens the
// game in a 90% overlay with the page dimmed behind it. Everything lives in a
// shadow DOM so Uniqlo's styles and ours never touch.
(() => {
  const HOST_ID = "artemator-host";
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const fabImg = chrome.runtime.getURL("icons/fab.png");
  const appUrl = chrome.runtime.getURL("index.html");

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .fab {
      position: fixed;
      right: 22px;
      bottom: 22px;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      border: 1px solid #e5e5e5;
      background: #fff;
      cursor: pointer;
      z-index: 2147483646;
      overflow: hidden;
      padding: 0;
      animation: artem-bob 3.6s ease-in-out infinite;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .fab:hover { transform: scale(1.07); }
    .fab img { width: 100%; height: 100%; display: block; }

    .fab-label {
      position: fixed;
      right: 96px;
      bottom: 40px;
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 999px;
      padding: 7px 14px;
      font: 500 13px/1 "Instrument Sans", system-ui, sans-serif;
      color: #141414;
      white-space: nowrap;
      z-index: 2147483646;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    .fab:hover + .fab-label { opacity: 1; }

    @keyframes artem-bob {
      0%, 100% { translate: 0 0; }
      50% { translate: 0 -6px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .fab { animation: none; }
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      z-index: 2147483646;
      opacity: 0;
      transition: opacity 0.22s ease;
    }
    .panel {
      position: fixed;
      top: 5vh;
      left: 5vw;
      width: 90vw;
      height: 90vh;
      background: #fafafa;
      border-radius: 16px;
      overflow: hidden;
      z-index: 2147483647;
      opacity: 0;
      transform: scale(0.985);
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .open .backdrop { opacity: 1; }
    .open .panel { opacity: 1; transform: none; }
    .panel iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
    .close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 1px solid #e5e5e5;
      background: #fff;
      color: #141414;
      font: 400 18px/1 system-ui, sans-serif;
      cursor: pointer;
      transition: background 0.12s ease;
    }
    .close:hover { background: #f5f5f5; }
  `;
  root.appendChild(style);

  const fab = document.createElement("button");
  fab.className = "fab";
  fab.setAttribute("aria-label", "Open Artemator");
  fab.innerHTML = `<img src="${fabImg}" alt="" />`;
  root.appendChild(fab);

  const label = document.createElement("span");
  label.className = "fab-label";
  label.textContent = "Can I guess your piece?";
  root.appendChild(label);

  let wrap = null;

  const close = () => {
    if (!wrap) return;
    const w = wrap;
    wrap = null;
    w.classList.remove("open");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => w.remove(), 240);
  };

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  const open = () => {
    if (wrap) return;
    wrap = document.createElement("div");

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.addEventListener("click", close);

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Artemator");

    const iframe = document.createElement("iframe");
    iframe.src = appUrl;
    iframe.allow = "";

    const closeBtn = document.createElement("button");
    closeBtn.className = "close";
    closeBtn.setAttribute("aria-label", "Close Artemator");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", close);

    panel.appendChild(iframe);
    panel.appendChild(closeBtn);
    wrap.appendChild(backdrop);
    wrap.appendChild(panel);
    root.appendChild(wrap);
    document.addEventListener("keydown", onKey, true);

    requestAnimationFrame(() => requestAnimationFrame(() => wrap && wrap.classList.add("open")));
  };

  fab.addEventListener("click", () => (wrap ? close() : open()));
})();
