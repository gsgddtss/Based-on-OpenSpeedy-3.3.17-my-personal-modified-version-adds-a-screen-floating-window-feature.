import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import "./i18n";
import App from "./App";
import Overlay from "./components/Overlay";
import { SnackbarProvider } from "./contexts/SnackbarContext";
import { ErrorBoundary, installGlobalErrorHandlers } from "./utils/frontendLog";

// The floating widget is a second window loading the same bundle; the query
// string tells them apart.
const isOverlay = new URLSearchParams(window.location.search).has("overlay");

// Before React mounts: anything thrown during startup must reach the log file
// instead of leaving an empty window behind.
installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isOverlay ? (
        <Overlay />
      ) : (
        <SnackbarProvider>
          <App />
        </SnackbarProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
