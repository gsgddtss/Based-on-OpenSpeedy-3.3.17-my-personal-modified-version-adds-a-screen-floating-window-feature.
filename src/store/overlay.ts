import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { setSetting } from "./settings";

/** Emitted (to every window) when the overlay is shown or hidden. */
export const OVERLAY_ENABLED_EVENT = "openspeedy://overlay-enabled";
/** Emitted by the overlay when it changes the speed, so the main window follows. */
export const SPEED_CHANGED_EVENT = "openspeedy://speed-changed";
/** Emitted by the main window to ask the overlay to go back to its default spot. */
export const OVERLAY_RESET_POSITION_EVENT = "openspeedy://overlay-reset-position";

export const OVERLAY_LABEL = "overlay";

let _win: WebviewWindow | null = null;

/**
 * The overlay window declared in tauri.conf.json (created hidden at startup).
 *
 * getByLabel is asynchronous in the Tauri v2 JS API, hence the promise; the
 * resolved instance is cached because every show/hide would otherwise pay for
 * another IPC round-trip. Resolves null when the window is missing — the app
 * stays usable without it.
 */
export async function overlayWindow(): Promise<WebviewWindow | null> {
  if (_win) return _win;
  _win = await WebviewWindow.getByLabel(OVERLAY_LABEL).catch(() => null);
  return _win;
}

/**
 * Show or hide the floating overlay and remember the choice.
 *
 * persist is false when the caller is merely reacting to a stored value —
 * writing it back would emit another event and bounce the two windows.
 */
export async function setOverlayVisible(visible: boolean, persist = true): Promise<void> {
  const win = await overlayWindow();
  if (!win) return;

  try {
    if (visible) {
      await win.show();
      await win.setAlwaysOnTop(true);
    } else {
      await win.hide();
    }
  } catch (e) {
    console.error("[overlay] could not change visibility", e);
    return;
  }

  if (persist) {
    await setSetting("overlayEnabled", visible).catch(() => {});
    await emit(OVERLAY_ENABLED_EVENT, visible).catch(() => {});
  }
}

/** Flip the overlay and return its new visibility. */
export async function toggleOverlay(): Promise<boolean> {
  const win = await overlayWindow();
  if (!win) return false;
  const visible = await win.isVisible().catch(() => false);
  const next = !visible;
  await setOverlayVisible(next);
  return next;
}
