// ── Types ──────────────────────────────────────────────────────────────────

export interface SettingsState {
  [key: string]: string | number | boolean;

  increaseSpeedShortcut: string;
  increaseSpeedStep: number;
  decreaseSpeedShortcut: string;
  decreaseSpeedStep: number;
  resetSpeedShortcut: string;

  gear1Shortcut: string;
  gear1Speed: number;
  gear2Shortcut: string;
  gear2Speed: number;
  gear3Shortcut: string;
  gear3Speed: number;
  gear4Shortcut: string;
  gear4Speed: number;
  gear5Shortcut: string;
  gear5Speed: number;

  holdShortcut: string;
  holdSpeed: number;

  theme: "light" | "dark";
  autoStart: boolean;
  alwaysOnTop: boolean;
  hideToTray: boolean;
  language: "zh-CN" | "zh-TW" | "ja-JP" | "ko-KR" | "de-DE" | "fr-FR" | "en-US" | "ru-RU" | "hi-IN" | "nl-NL" | "pt-BR" | "es-ES";
  speed: number;

  // ── Floating overlay ──────────────────────────────────────────────────
  /** Whether the always-on-top speed widget is shown. */
  overlayEnabled: boolean;
  /** Global shortcut that shows / hides the overlay. */
  overlayShortcut: string;
  /** Card opacity, 0.3 – 1.0 (the window itself stays fully transparent). */
  overlayOpacity: number;
  /** UI scale of the widget. */
  overlayScale: number;
  /** "full" shows gears + target info, "mini" is just the speed. */
  overlayStyle: "full" | "mini";
  /** Let the mouse click *through* the widget onto whatever is underneath. */
  overlayClickThrough: boolean;
  /** Lock the widget in place (dragging disabled). */
  overlayLocked: boolean;
  /** Last position in logical pixels, -1 = let the OS place it. */
  overlayX: number;
  overlayY: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULTS: SettingsState = {
  increaseSpeedShortcut: "",
  increaseSpeedStep: 0.5,
  decreaseSpeedShortcut: "",
  decreaseSpeedStep: 0.5,
  resetSpeedShortcut: "Ctrl+Alt+0",

  gear1Shortcut: "Ctrl+Shift+1",
  gear1Speed: 1.0,
  gear2Shortcut: "Ctrl+Shift+2",
  gear2Speed: 2.0,
  gear3Shortcut: "Ctrl+Shift+3",
  gear3Speed: 5.0,
  gear4Shortcut: "",
  gear4Speed: 10.0,
  gear5Shortcut: "",
  gear5Speed: 100.0,

  holdShortcut: "",
  holdSpeed: 2.0,

  theme: "light" as const,
  autoStart: false,
  alwaysOnTop: false,
  // Closing the window tucks the app away in the tray. On by default, which is
  // how the app has always behaved; turn it off to make the close button exit.
  hideToTray: true,
  language: "en-US" as const,
  speed: 1.0,

  overlayEnabled: true,
  overlayShortcut: "Ctrl+Alt+O",
  overlayOpacity: 0.92,
  overlayScale: 1,
  overlayStyle: "full" as const,
  overlayClickThrough: false,
  overlayLocked: false,
  overlayX: -1,
  overlayY: -1,
};

// ── Store (singleton) ─────────────────────────────────────────────────────

import { Store } from "@tauri-apps/plugin-store";
import { locale } from "@tauri-apps/plugin-os";
import { emit } from "@tauri-apps/api/event";
import { mapSystemLocale } from "../i18n";

/** Broadcast to every window after a setting is written, e.g. main → overlay. */
export const SETTINGS_CHANGED_EVENT = "openspeedy://settings-changed";

let _store: Store | null = null;

async function getStore() {
  if (!_store) _store = await Store.load("settings.json");
  return _store;
}

export async function loadSettings(): Promise<SettingsState> {
  const store = await getStore();
  const saved = await store.get<SettingsState>("settings");
  const merged = { ...DEFAULTS, ...saved } as SettingsState;

  // If user has never set a language, use the OS locale
  if (!saved?.language) {
    const sysLocale = await locale();
    merged.language = mapSystemLocale(sysLocale) as SettingsState["language"];
  }

  return merged;
}

export async function getSetting<K extends keyof SettingsState>(key: K): Promise<SettingsState[K]> {
  const store = await getStore();
  const saved = await store.get<SettingsState>("settings");
  const merged = { ...DEFAULTS, ...saved } as SettingsState;

  // If user has never set a language, use the OS locale
  if (!saved?.language) {
    const sysLocale = await locale();
    merged.language = mapSystemLocale(sysLocale) as SettingsState["language"];
  }

  return merged[key];
}

export async function setSetting<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
  const store = await getStore();
  const saved = (await store.get<SettingsState>("settings")) || ({} as SettingsState);
  saved[key] = value;
  await store.set("settings", saved);
  await store.save();

  // Each window keeps its settings in memory; tell the others (the floating
  // overlay reads opacity/scale/style from here) that this one changed.
  await emit(SETTINGS_CHANGED_EVENT, { key, value }).catch(() => {});
}
