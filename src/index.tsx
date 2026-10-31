import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initPwa } from "./pwa";

initPwa();

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
