import type { IDESettings } from "../types/ide";

export const IDE_SETTINGS_STORAGE_KEY = "colibri.settings";

export const DEFAULT_IDE_SETTINGS: IDESettings = {
  editorFontSize: 14,
  tabSize: 2,
  wordWrap: false,
  autoSave: false,
  showHiddenFiles: false,
  theme: "colibri-dark",
  showWelcomeOnStart: true,
};

export function loadIDESettings(): IDESettings {
  try {
    const raw = window.localStorage.getItem(IDE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_IDE_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<IDESettings>;

    return {
      editorFontSize:
        typeof parsed.editorFontSize === "number"
          ? Math.min(24, Math.max(11, Math.round(parsed.editorFontSize)))
          : DEFAULT_IDE_SETTINGS.editorFontSize,
      tabSize:
        typeof parsed.tabSize === "number"
          ? Math.min(8, Math.max(2, Math.round(parsed.tabSize)))
          : DEFAULT_IDE_SETTINGS.tabSize,
      wordWrap:
        typeof parsed.wordWrap === "boolean"
          ? parsed.wordWrap
          : DEFAULT_IDE_SETTINGS.wordWrap,
      autoSave:
        typeof parsed.autoSave === "boolean"
          ? parsed.autoSave
          : DEFAULT_IDE_SETTINGS.autoSave,
      showHiddenFiles:
        typeof parsed.showHiddenFiles === "boolean"
          ? parsed.showHiddenFiles
          : DEFAULT_IDE_SETTINGS.showHiddenFiles,
      theme:
        parsed.theme === "colibri-light" || parsed.theme === "colibri-dark"
          ? parsed.theme
          : DEFAULT_IDE_SETTINGS.theme,
      showWelcomeOnStart:
        typeof parsed.showWelcomeOnStart === "boolean"
          ? parsed.showWelcomeOnStart
          : DEFAULT_IDE_SETTINGS.showWelcomeOnStart,
    };
  } catch {
    return DEFAULT_IDE_SETTINGS;
  }
}

export function saveIDESettings(settings: IDESettings) {
  window.localStorage.setItem(IDE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function applyThemeToDocument(theme: IDESettings["theme"]) {
  document.documentElement.setAttribute("data-theme", theme);
}
