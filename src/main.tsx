import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/400-italic.css";
import "@fontsource/fraunces/600-italic.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "./styles.css";

// inside the extension overlay, leave room for the host's close button
if (window.self !== window.top) document.body.classList.add("embedded");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
