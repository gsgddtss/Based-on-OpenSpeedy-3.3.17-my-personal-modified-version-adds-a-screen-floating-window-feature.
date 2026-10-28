import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSettings } from "./useSettings";
import { OVERLAY_ENABLED_EVENT, setOverlayVisible } from "../store/overlay";

/**
 * Keeps the floating overlay in step with the `overlayEnabled` setting.
 *
 * Lives in the main window only: it is the owner of the setting, while the
 * overlay window reports back through `OVERLAY_ENABLED_EVENT` when the user
 * closes it from inside the widget.
 */
export function useOverlay() {
  const { settings, set } = useSettings();
  const enabled = settings ? Boolean(settings.overlayEnabled) : null;

  // Mirrors `enabled` for the event listener. `emit` also reaches the window
  // that emitted it, so without this guard reacting to our own event would
  // write the setting again and loop forever.
  const enabledRef = useRef<boolean | null>(null);
  enabledRef.current = enabled;

  useEffect(() => {
    if (enabled === null) return;
    // Not persisted here: the value came *from* the store, writing it back
    // would emit an event and ping-pong with the overlay window.
    void setOverlayVisible(enabled, false);
  }, [enabled]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let live = true;

    listen<boolean>(OVERLAY_ENABLED_EVENT, (event) => {
      // Mirror the widget's own choice into the settings cache so the switch in
      // the settings panel matches what the user just did to the overlay.
      if (enabledRef.current === event.payload) return;
      enabledRef.current = event.payload;
      set("overlayEnabled", event.payload);
    })
      .then((fn) => {
        if (live) unlisten = fn;
        else fn();
      })
      .catch(() => {});

    return () => {
      live = false;
      unlisten?.();
    };
  }, [set]);
}
