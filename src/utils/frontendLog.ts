/**
 * Frontend error reporting.
 *
 * The webview has no devtools in a release build, so a JavaScript error during
 * startup (a bad plugin call, a failed dynamic import, an unsupported API)
 * would otherwise leave nothing behind — the window just never appears. Errors
 * caught here are forwarded to the Rust side, which appends them to the same
 * `openspeedy.log` written next to the executable.
 */

import React from "react";
import { invoke } from "@tauri-apps/api/core";

/** Send one error to the backend log. Never throws, never rejects. */
export async function reportError(source: string, message: string, stack?: string | null) {
  try {
    await invoke("report_frontend_error", {
      source,
      message: String(message).slice(0, 4000),
      stack: stack ? String(stack).slice(0, 8000) : null,
    });
  } catch {
    // Backend not reachable (very early error, or IPC broken) — nothing we can
    // do here without a console to log to.
  }
}

let installed = false;

/**
 * Install global handlers. Safe to call more than once; only the first call
 * takes effect.
 */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    void reportError(
      "window.onerror",
      event.message || String(event.error),
      event.error?.stack,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: string; stack?: string } | string | undefined;
    void reportError(
      "unhandledrejection",
      typeof reason === "string" ? reason : reason?.message ?? String(reason),
      typeof reason === "string" ? undefined : reason?.stack,
    );
  });
}

/**
 * Catches render errors. Without it a thrown component unmounts the whole tree
 * and leaves a blank window with no explanation.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    void reportError("react.render", error.message, `${error.stack ?? ""}\n${info.componentStack ?? ""}`);
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        "div",
        {
          style: {
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            padding: "32px",
            color: "#c62828",
            height: "100vh",
            boxSizing: "border-box",
            overflow: "auto",
          },
        },
        React.createElement("h2", { style: { marginTop: 0 } }, "OpenSpeedy 启动出错 / Startup error"),
        React.createElement("pre", { style: { whiteSpace: "pre-wrap", color: "#444" } }, String(this.state.error)),
        React.createElement(
          "p",
          { style: { color: "#666" } },
          "详细信息已写入日志文件，请把日志发给开发者以定位问题。 / Details were written to the log file — please send it to the developer.",
        ),
      );
    }
    return this.props.children;
  }
}
