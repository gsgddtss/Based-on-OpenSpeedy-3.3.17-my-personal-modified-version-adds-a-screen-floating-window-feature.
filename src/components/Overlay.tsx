import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Box, GlobalStyles, IconButton, Tooltip, Typography } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import CloseIcon from "@mui/icons-material/Close";
import PauseIcon from "@mui/icons-material/Pause";
import PlayIcon from "@mui/icons-material/PlayArrow";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { useSettings } from "../hooks/useSettings";
import { setSetting } from "../store/settings";
import {
  OVERLAY_ENABLED_EVENT,
  OVERLAY_RESET_POSITION_EVENT,
  SPEED_CHANGED_EVENT,
} from "../store/overlay";

// ── Types ─────────────────────────────────────────────────────────────────

interface AccelState {
  enabled: number[];
  tracked: number;
}

interface ProcessLite {
  pid: number;
  name: string;
}

interface Gear {
  speed: number;
}

/** Content size in logical pixels, before the user's scale factor. */
const BASE = {
  full: { width: 248, height: 136 },
  mini: { width: 176, height: 56 },
} as const;

const POLL_MS = 700;
const EDGE_MARGIN = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── Component ─────────────────────────────────────────────────────────────

/**
 * The floating speed widget: a frameless, always-on-top, click-through-capable
 * window that mirrors the bridge state and can drive it without the main window.
 */
export default function Overlay() {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const [speed, setSpeed] = useState(1);
  const [accel, setAccel] = useState<AccelState>({ enabled: [], tracked: 0 });
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const restoredRef = useRef(false);
  const lastKeyRef = useRef("");

  const mini = settings?.overlayStyle === "mini";
  const scale = clamp(Number(settings?.overlayScale) || 1, 0.7, 1.6);
  const opacity = clamp(Number(settings?.overlayOpacity) || 0.92, 0.3, 1);
  const locked = Boolean(settings?.overlayLocked);
  const clickThrough = Boolean(settings?.overlayClickThrough);

  const gears = useMemo<Gear[]>(() => [1, 2, 3, 4, 5]
    .map(i => ({ speed: Number(settings?.[`gear${i}Speed`]) || 1 }))
    .filter(g => g.speed > 0),
  [settings]);

  const speedColor = speed > 1.01 ? "#FF8A3D" : speed < 0.99 ? "#4FC3F7" : "#B0BEC5";
  const statusColor = accel.enabled.length > 0 ? "#4CD964" : accel.tracked > 0 ? "#FFB74D" : "#607D8B";

  // ── Window behaviour ───────────────────────────────────────────────────

  // Keep the window exactly as large as the (zoomed) card, so the transparent
  // margin stays small and the widget never clips its own content.
  useEffect(() => {
    const base = mini ? BASE.mini : BASE.full;
    const size = new LogicalSize(
      Math.round(base.width * scale),
      Math.round(base.height * scale),
    );
    void getCurrentWindow().setSize(size).catch(() => {});
  }, [mini, scale]);

  // Restore the saved spot once the settings have loaded.
  useEffect(() => {
    if (!settings || restoredRef.current) return;
    restoredRef.current = true;
    const x = Number(settings.overlayX);
    const y = Number(settings.overlayY);
    if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0) {
      void getCurrentWindow().setPosition(new LogicalPosition(x, y)).catch(() => {});
    }
  }, [settings]);

  // Remember where the user dragged it (debounced — `move` fires per frame).
  useEffect(() => {
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;
    let live = true;

    getCurrentWindow()
      .onMoved(({ payload }) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          const ratio = window.devicePixelRatio || 1;
          void setSetting("overlayX", Math.round(payload.x / ratio)).catch(() => {});
          void setSetting("overlayY", Math.round(payload.y / ratio)).catch(() => {});
        }, 400);
      })
      .then(fn => { if (live) unlisten = fn; else fn(); })
      .catch(() => {});

    return () => {
      live = false;
      window.clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  // "Reset position" comes from the settings panel.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let live = true;
    const base = mini ? BASE.mini : BASE.full;

    listen(OVERLAY_RESET_POSITION_EVENT, () => {
      const width = Math.round(base.width * scale);
      const screen = window.screen;
      const x = Math.max(20, (screen?.availWidth ?? 1280) - width - 60);
      const y = 60;
      void getCurrentWindow().setPosition(new LogicalPosition(x, y)).catch(() => {});
      void setSetting("overlayX", x).catch(() => {});
      void setSetting("overlayY", y).catch(() => {});
    })
      .then(fn => { if (live) unlisten = fn; else fn(); })
      .catch(() => {});

    return () => { live = false; unlisten?.(); };
  }, [mini, scale]);

  // Click-through is what makes the widget usable on top of a game: the mouse
  // goes straight to the window underneath.
  useEffect(() => {
    void getCurrentWindow().setIgnoreCursorEvents(clickThrough).catch(() => {});
  }, [clickThrough]);

  useEffect(() => {
    void getCurrentWindow().setAlwaysOnTop(true).catch(() => {});
  }, []);

  // ── Bridge polling ─────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const current = await invoke<number | null>("bridge_get_speed");
        if (alive && typeof current === "number" && Number.isFinite(current)) {
          setSpeed(current);
        }
      } catch { /* bridges not up yet — keep the last known value */ }

      try {
        const state = await invoke<AccelState>("bridge_accel_state");
        if (!alive) return;
        setAccel(state);

        // Only pay for the process enumeration when the set actually changed.
        const key = state.enabled.join(",");
        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key;
          if (state.enabled.length === 0) {
            setNames([]);
          } else {
            const list = await invoke<ProcessLite[]>("get_process_list_fast");
            if (!alive) return;
            const byPid = new Map(list.map(p => [p.pid, p.name]));
            setNames([...new Set(state.enabled.map(pid => byPid.get(pid) ?? `PID ${pid}`))]);
          }
        }
      } catch { /* keep the previous state */ }
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────

  const applySpeed = useCallback(async (value: number) => {
    const next = clamp(Number(value.toFixed(3)), 0.001, 1000);
    setSpeed(next);
    try {
      await invoke("bridge_set_speed", { factor: next });
      await setSetting("speed", next);
      // The main window's panel has its own copy of the speed — tell it.
      await emit(SPEED_CHANGED_EVENT, next);
    } catch (e) {
      console.error("[overlay] could not apply speed", e);
    }
  }, []);

  const toggleAcceleration = useCallback(async () => {
    setBusy(true);
    try {
      if (accel.enabled.length > 0) await invoke("bridge_pause_all");
      else await invoke("bridge_resume_all");
      const state = await invoke<AccelState>("bridge_accel_state");
      setAccel(state);
      if (state.enabled.length === 0) {
        lastKeyRef.current = "";
        setNames([]);
      }
    } catch (e) {
      console.error("[overlay] could not toggle acceleration", e);
    } finally {
      setBusy(false);
    }
  }, [accel.enabled.length]);

  const hideSelf = useCallback(async () => {
    await setSetting("overlayEnabled", false).catch(() => {});
    await emit(OVERLAY_ENABLED_EVENT, false).catch(() => {});
    await getCurrentWindow().hide().catch(() => {});
  }, []);

  // Alt+F4 and anything else that asks the window to close should hide the
  // widget, not destroy it — the hotkey has to be able to bring it back.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let live = true;

    getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        await hideSelf();
      })
      .then(fn => { if (live) unlisten = fn; else fn(); })
      .catch(() => {});

    return () => { live = false; unlisten?.(); };
  }, [hideSelf]);

  /**
   * Dragging is done by hand rather than with `data-tauri-drag-region`, so the
   * "locked" setting can disable it and buttons keep working: the whole card is
   * a handle except for the controls inside it.
   */
  const startDrag = useCallback(async (event: MouseEvent) => {
    if (locked || clickThrough || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, [role='button']")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch { /* window is not draggable any more — nothing to do */ }
  }, [locked, clickThrough]);

  const increaseStep = Number(settings?.increaseSpeedStep) || 0.5;
  const decreaseStep = Number(settings?.decreaseSpeedStep) || 0.5;

  const iconButtonSx = {
    p: 0.35,
    color: "rgba(255,255,255,0.72)",
    "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.10)" },
  } as const;

  const statusText = accel.enabled.length > 0
    ? `${t("overlay.accelerating")}${names.length > 0 ? ` · ${names.join(", ")}` : ""}`
    : accel.tracked > 0
      ? t("overlay.paused")
      : t("overlay.idle");

  // Fixed pixel box + `zoom`: the window is sized to `base × scale`, so the two
  // always agree and nothing can rely on a percentage of an ambiguous box.
  const base = mini ? BASE.mini : BASE.full;

  return (
    <>
      {/* A transparent window shows the page background, so it has to go. */}
      <GlobalStyles styles={{
        "html, body, #root": {
          margin: 0, padding: 0, height: "100%", width: "100%",
          background: "transparent", overflow: "hidden",
        },
      }} />

      <Box sx={{ width: base.width, height: base.height, zoom: scale, background: "transparent" }}>
        <Box
          onMouseDown={startDrag}
          sx={{
            m: `${EDGE_MARGIN}px`,
            height: `calc(100% - ${EDGE_MARGIN * 2}px)`,
            boxSizing: "border-box",
            borderRadius: 2.5,
            background: `rgba(16, 19, 26, ${opacity})`,
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
            backdropFilter: "blur(14px)",
            color: "#ECEFF1",
            userSelect: "none",
            display: "flex",
            flexDirection: mini ? "row" : "column",
            alignItems: mini ? "center" : "stretch",
            px: 1.25,
            py: mini ? 0.5 : 0.75,
            gap: mini ? 0.5 : 0,
            cursor: locked ? "default" : "grab",
            overflow: "hidden",
          }}
        >
          {/* ── Speed readout ── */}
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.4, minWidth: 0 }}>
            <BoltIcon sx={{ fontSize: 15, color: speedColor, alignSelf: "center" }} />
            <Typography
              sx={{
                fontSize: mini ? "1.15rem" : "1.4rem",
                fontWeight: 800,
                lineHeight: 1.1,
                fontVariantNumeric: "tabular-nums",
                color: speedColor,
                letterSpacing: -0.5,
              }}
            >
              {speed.toFixed(3)}
            </Typography>
            <Typography sx={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.5)" }}>×</Typography>
            {!mini && <Box sx={{ flex: 1 }} />}
            {!mini && (
              <>
                <Tooltip title={accel.enabled.length > 0 ? t("overlay.pause") : t("overlay.resume")}>
                  <span>
                    <IconButton
                      size="small"
                      disabled={busy || (accel.tracked === 0)}
                      onClick={toggleAcceleration}
                      sx={{ ...iconButtonSx, color: accel.enabled.length > 0 ? "#4CD964" : "rgba(255,255,255,0.72)" }}
                    >
                      {accel.enabled.length > 0
                        ? <PauseIcon sx={{ fontSize: 15 }} />
                        : <PlayIcon sx={{ fontSize: 15 }} />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t("overlay.hide")}>
                  <IconButton size="small" onClick={hideSelf} sx={iconButtonSx}>
                    <CloseIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>

          {mini ? (
            <>
              <Box sx={{ flex: 1 }} />
              <IconButton size="small" onClick={() => applySpeed(speed - decreaseStep)} sx={iconButtonSx}>
                <RemoveIcon sx={{ fontSize: 15 }} />
              </IconButton>
              <IconButton size="small" onClick={() => applySpeed(speed + increaseStep)} sx={iconButtonSx}>
                <AddIcon sx={{ fontSize: 15 }} />
              </IconButton>
              <Tooltip title={t("overlay.hide")}>
                <IconButton size="small" onClick={hideSelf} sx={iconButtonSx}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <>
              {/* ── Target status ── */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, mt: 0.25, minWidth: 0 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusColor, flexShrink: 0 }} />
                <Typography noWrap sx={{ fontSize: "0.64rem", color: "rgba(255,255,255,0.58)", minWidth: 0 }}>
                  {statusText}
                </Typography>
              </Box>

              {/* ── Controls ── */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, mt: 0.6 }}>
                <Box sx={{ display: "flex", gap: 0.35, flex: 1, minWidth: 0, overflow: "hidden" }}>
                  {gears.map((gear, index) => {
                    const active = Math.abs(speed - gear.speed) < 0.001;
                    return (
                      <Box
                        key={index}
                        component="button"
                        onClick={() => applySpeed(gear.speed)}
                        title={t("overlay.gear", { index: index + 1 })}
                        sx={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 1,
                          bgcolor: active ? "rgba(255,138,61,0.18)" : "rgba(255,255,255,0.05)",
                          color: active ? speedColor : "rgba(255,255,255,0.62)",
                          fontSize: "0.6rem",
                          fontFamily: "inherit",
                          fontWeight: active ? 700 : 500,
                          px: 0.55,
                          py: 0.2,
                          lineHeight: 1.3,
                          cursor: "pointer",
                          flexShrink: 0,
                          "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
                        }}
                      >
                        {gear.speed >= 10 ? gear.speed.toFixed(0) : gear.speed.toFixed(1)}×
                      </Box>
                    );
                  })}
                </Box>
                <IconButton size="small" onClick={() => applySpeed(speed - decreaseStep)} sx={iconButtonSx}>
                  <RemoveIcon sx={{ fontSize: 15 }} />
                </IconButton>
                <IconButton size="small" onClick={() => applySpeed(speed + increaseStep)} sx={iconButtonSx}>
                  <AddIcon sx={{ fontSize: 15 }} />
                </IconButton>
                <IconButton size="small" onClick={() => applySpeed(1)} sx={iconButtonSx}>
                  <RestartAltIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </>
  );
}
