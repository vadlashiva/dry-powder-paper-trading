import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initPwa } from "./pwa";

initPwa();

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

// Shown at the top of every screen. The pop-out chart window fills the whole window, so it's left out there.
const isPopout = window.location.hash.startsWith("#/chart");
const eduNoticeStyle: React.CSSProperties = {
  position: "sticky", top: 0, zIndex: 35, background: "#0B1220", color: "#D2DBEB",
  fontFamily: "'Instrument Sans', Inter, system-ui, sans-serif", fontSize: "12.5px", fontWeight: 600,
  lineHeight: 1.4, textAlign: "center", padding: "6px 12px",
};

root.render(
  <React.StrictMode>
    {!isPopout && (
      <div role="note" style={eduNoticeStyle}>
        For education purposes only. Not investment advice.{" "}
        <a href="/disclaimer.html" style={{ color: "#fff", textDecoration: "underline" }}>Disclaimer</a>
      </div>
    )}
    <App />
  </React.StrictMode>
);
