import React from "react";
import ReactDOM from "react-dom/client";
import App, { SITE_CLOSED } from "./App";
import { initPwa } from "./pwa";
import { isSimulated } from "./brokers";

initPwa();

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

// Shown at the top of every screen. The pop-out chart window fills the whole window, so it's left out there.
const isPopout = window.location.hash.startsWith("#/chart") || SITE_CLOSED;
const eduNoticeStyle: React.CSSProperties = {
  position: "sticky", top: 0, zIndex: 35, background: "#0B1220", color: "#D2DBEB",
  fontFamily: "'Instrument Sans', Inter, system-ui, sans-serif", fontSize: "12.5px", fontWeight: 600,
  lineHeight: 1.4, textAlign: "center", padding: "6px 12px",
};

// On the practice market, say plainly that prices are simulated, with a way to connect a real broker.
function SimNotice() {
  const [on, setOn] = React.useState(isSimulated);
  React.useEffect(() => {
    const upd = () => setOn(isSimulated());
    window.addEventListener("pr-broker-changed", upd);
    window.addEventListener("storage", upd);
    return () => { window.removeEventListener("pr-broker-changed", upd); window.removeEventListener("storage", upd); };
  }, []);
  if (!on) return null;
  return (
    <div role="note" style={{ ...eduNoticeStyle, position: "static", background: "#3B2A06", color: "#FFE3A3" }}>
      Practice market: prices are simulated, not real NSE data.{" "}
      <a href="/?connect=1" style={{ color: "#fff", textDecoration: "underline" }}>Connect your broker for live prices</a>
    </div>
  );
}

root.render(
  <React.StrictMode>
    {!isPopout && (
      <div style={{ position: "sticky", top: 0, zIndex: 35 }}>
        <div role="note" style={{ ...eduNoticeStyle, position: "static" }}>
          For education purposes only. Not investment advice.{" "}
          <a href="/disclaimer.html" style={{ color: "#fff", textDecoration: "underline" }}>Disclaimer</a>
        </div>
        <SimNotice />
      </div>
    )}
    <App />
  </React.StrictMode>
);
