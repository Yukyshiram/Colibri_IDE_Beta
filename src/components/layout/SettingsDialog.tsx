import { useEffect, useState } from "react";
import type { IDESettings } from "../../types/ide";
import "./SettingsDialog.css";

type SettingsDialogProps = {
  isOpen: boolean;
  settings: IDESettings;
  onClose: () => void;
  onSave: (settings: IDESettings) => void;
};

export default function SettingsDialog({
  isOpen,
  settings,
  onClose,
  onSave,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState<IDESettings>(settings);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(settings);
  }, [isOpen, settings]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const updateDraft = <K extends keyof IDESettings>(key: K, value: IDESettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      className="settings-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Cerrar settings">
            ×
          </button>
        </header>

        <div className="settings-grid">
          <label className="settings-row">
            <span>Font size</span>
            <input
              type="number"
              min={11}
              max={24}
              value={draft.editorFontSize}
              onChange={(e) => updateDraft("editorFontSize", Number(e.target.value) || 14)}
            />
          </label>

          <label className="settings-row">
            <span>Tab size</span>
            <input
              type="number"
              min={2}
              max={8}
              value={draft.tabSize}
              onChange={(e) => updateDraft("tabSize", Number(e.target.value) || 2)}
            />
          </label>

          <label className="settings-row">
            <span>Word wrap</span>
            <input
              type="checkbox"
              checked={draft.wordWrap}
              onChange={(e) => updateDraft("wordWrap", e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <span>Auto save</span>
            <input
              type="checkbox"
              checked={draft.autoSave}
              onChange={(e) => updateDraft("autoSave", e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <span>Mostrar archivos ocultos</span>
            <input
              type="checkbox"
              checked={draft.showHiddenFiles}
              onChange={(e) => updateDraft("showHiddenFiles", e.target.checked)}
            />
          </label>

          <label className="settings-row">
            <span>Tema</span>
            <select
              value={draft.theme}
              onChange={(e) => updateDraft("theme", e.target.value as IDESettings["theme"])}
            >
              <option value="colibri-dark">Colibri Dark</option>
              <option value="colibri-light">Colibri Light</option>
            </select>
          </label>

          <label className="settings-row">
            <span>Mostrar WelcomeScreen al iniciar</span>
            <input
              type="checkbox"
              checked={draft.showWelcomeOnStart}
              onChange={(e) => updateDraft("showWelcomeOnStart", e.target.checked)}
            />
          </label>
        </div>

        <footer className="settings-actions">
          <button className="settings-btn settings-btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="settings-btn settings-btn-primary" onClick={() => onSave(draft)}>Guardar</button>
        </footer>
      </section>
    </div>
  );
}
