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

  const confettiCanvas = document.createElement("canvas");
  const fireworks = globalThis.confetti?.create?.(confettiCanvas, {
    resize: true,
    useWorker: true,
  });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
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
      z-index: 2147483644;
      overflow: hidden;
      padding: 0;
      animation: artem-bob 3.6s ease-in-out infinite;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      pointer-events: auto;
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
      z-index: 2147483644;
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
      z-index: 2147483645;
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
      z-index: 2147483646;
      opacity: 0;
      transform: scale(0.985);
      transition: opacity 0.22s ease, transform 0.22s ease;
      pointer-events: auto;
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
      top: 16px;
      right: 16px;
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      padding: 0;
      border-radius: 50%;
      border: 1px solid #e5e5e5;
      background: #fff;
      color: #141414;
      cursor: pointer;
      transition: background 0.12s ease;
    }
    .close::before,
    .close::after {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      width: 15px;
      height: 1.5px;
      border-radius: 999px;
      background: currentColor;
      transform: translate(-50%, -50%) rotate(45deg);
    }
    .close::after { transform: translate(-50%, -50%) rotate(-45deg); }
    .close:hover { background: #f5f5f5; }
    .artemator-confetti { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483647; }
  `;
  root.appendChild(style);

  if (fireworks) {
    confettiCanvas.className = "artemator-confetti";
    root.appendChild(confettiCanvas);
  }

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
  let scrollLock = null;
  let winMessageHandler = null;
  let fireworksRunning = false;
  let fireworksRunId = 0;

  const randomInRange = (min, max) => Math.random() * (max - min) + min;
  const startFireworks = () => {
    if (!fireworks || fireworksRunning || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    fireworksRunning = true;
    const runId = ++fireworksRunId;
    const duration = 30_000;
    const end = Date.now() + duration;
    const defaults = { startVelocity: 16, gravity: 0.45, decay: 0.92, spread: 360, ticks: 100, zIndex: 2147483647, disableForReducedMotion: true };

    const launch = () => {
      if (runId !== fireworksRunId) return;
      const timeLeft = end - Date.now();
      if (timeLeft <= 0) { fireworksRunning = false; return; }
      const particleCount = Math.max(1, Math.round(6 * (timeLeft / duration)));
      fireworks({ ...defaults, particleCount, origin: { x: randomInRange(0.08, 0.28), y: randomInRange(0.35, 0.7) } });
      fireworks({ ...defaults, particleCount, origin: { x: randomInRange(0.72, 0.92), y: randomInRange(0.35, 0.7) } });
      window.setTimeout(launch, 700);
    };

    launch();
  };

  const stopFireworks = () => {
    fireworksRunId += 1;
    fireworksRunning = false;
    fireworks?.reset?.();
  };

  const preventPageScroll = (event) => event.preventDefault();
  const preventScrollKeys = (event) => {
    if ([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
    }
  };

  const lockPageScroll = () => {
    scrollLock = {
      htmlValue: document.documentElement.style.getPropertyValue("overflow"),
      htmlPriority: document.documentElement.style.getPropertyPriority("overflow"),
      bodyValue: document.body.style.getPropertyValue("overflow"),
      bodyPriority: document.body.style.getPropertyPriority("overflow"),
    };
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    document.body.style.setProperty("overflow", "hidden", "important");
    document.addEventListener("wheel", preventPageScroll, { capture: true, passive: false });
    document.addEventListener("touchmove", preventPageScroll, { capture: true, passive: false });
    document.addEventListener("keydown", preventScrollKeys, true);
  };

  const unlockPageScroll = () => {
    if (!scrollLock) return;
    const restore = (element, value, priority) => {
      if (value) element.style.setProperty("overflow", value, priority);
      else element.style.removeProperty("overflow");
    };
    restore(document.documentElement, scrollLock.htmlValue, scrollLock.htmlPriority);
    restore(document.body, scrollLock.bodyValue, scrollLock.bodyPriority);
    document.removeEventListener("wheel", preventPageScroll, true);
    document.removeEventListener("touchmove", preventPageScroll, true);
    document.removeEventListener("keydown", preventScrollKeys, true);
    scrollLock = null;
  };

  const close = () => {
    if (!wrap) return;
    const w = wrap;
    wrap = null;
    if (winMessageHandler) {
      window.removeEventListener("message", winMessageHandler);
      winMessageHandler = null;
    }
    stopFireworks();
    unlockPageScroll();
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
    lockPageScroll();
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
    winMessageHandler = (event) => {
      if (event.source !== iframe.contentWindow) return;
      if (event.data?.source !== "artemator" || event.data?.type !== "won") return;
      startFireworks();
    };
    window.addEventListener("message", winMessageHandler);

    const closeBtn = document.createElement("button");
    closeBtn.className = "close";
    closeBtn.setAttribute("aria-label", "Close Artemator");
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
