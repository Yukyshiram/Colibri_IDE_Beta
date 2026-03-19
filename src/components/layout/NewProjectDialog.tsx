import { useEffect, useMemo, useState } from "react";
import type { ConsoleProjectTemplate } from "../../lib/project-templates";
import "./NewProjectDialog.css";

export type NewProjectDialogSubmitPayload = {
  projectName: string;
  location: string;
  language: "c" | "cpp";
  createProjectFolder: boolean;
  template: ConsoleProjectTemplate;
};

type NewProjectDialogProps = {
  isOpen: boolean;
  initialLanguage: "c" | "cpp";
  location: string;
  isSubmitting: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onPickLocation: () => void | Promise<void>;
  onSubmit: (payload: NewProjectDialogSubmitPayload) => void | Promise<void>;
};

const PROJECT_NAME_RE = /^[^<>:"/\\|?*\x00-\x1F]+$/;

export default function NewProjectDialog({
  isOpen,
  initialLanguage,
  location,
  isSubmitting,
  errorMessage,
  onCancel,
  onPickLocation,
  onSubmit,
}: NewProjectDialogProps) {
  const [projectName, setProjectName] = useState("nuevo-proyecto");
  const [language, setLanguage] = useState<"c" | "cpp">(initialLanguage);
  const [createProjectFolder, setCreateProjectFolder] = useState(true);
  const [template, setTemplate] = useState<ConsoleProjectTemplate>("hello-world");

  useEffect(() => {
    if (!isOpen) return;

    setLanguage(initialLanguage);
    setProjectName(initialLanguage === "c" ? "nuevo-proyecto-c" : "nuevo-proyecto-cpp");
    setCreateProjectFolder(true);
    setTemplate("hello-world");
  }, [isOpen, initialLanguage]);

  const normalizedName = projectName.trim();
  const showNameError =
    normalizedName.length > 0 &&
    (!PROJECT_NAME_RE.test(normalizedName) || normalizedName === "." || normalizedName === "..");

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false;
    if (!location.trim()) return false;
    if (normalizedName.length < 2) return false;
    if (showNameError) return false;
    return true;
  }, [isSubmitting, location, normalizedName, showNameError]);

  if (!isOpen) return null;

  const projectRootPreview = createProjectFolder
    ? `${location}${location.match(/[\\/]$/) ? "" : "\\"}${normalizedName || "project-name"}`
    : location || "(sin ubicacion)";

  const mainFilePreview = `${projectRootPreview}${projectRootPreview.match(/[\\/]$/) ? "" : "\\"}${
    language === "c" ? "main.c" : "main.cpp"
  }`;

  const submit = () => {
    if (!canSubmit) return;

    void onSubmit({
      projectName: normalizedName,
      location: location.trim(),
      language,
      createProjectFolder,
      template,
    });
  };

  return (
    <div className="new-project-overlay" onClick={onCancel}>
      <div
        className="new-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create New Project"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>New Project</h2>

        <label className="new-project-field">
          <span>Project name</span>
          <input
            className={`new-project-input ${showNameError ? "new-project-input-error" : ""}`}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="my-project"
            autoFocus
          />
          {showNameError && (
            <span className="new-project-inline-error">
              Nombre invalido. Evita caracteres especiales de rutas.
            </span>
          )}
        </label>

        <div className="new-project-grid-two">
          <label className="new-project-field">
            <span>Language</span>
            <select
              className="new-project-input"
              value={language}
              onChange={(event) => setLanguage(event.target.value as "c" | "cpp")}
            >
              <option value="c">C</option>
              <option value="cpp">C++</option>
            </select>
          </label>

          <label className="new-project-field">
            <span>Template</span>
            <select
              className="new-project-input"
              value={template}
              onChange={(event) => setTemplate(event.target.value as ConsoleProjectTemplate)}
            >
              <option value="hello-world">Hello World</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>
        </div>

        <label className="new-project-field">
          <span>Location</span>
          <div className="new-project-location-row">
            <input className="new-project-input" value={location} readOnly />
            <button
              className="new-project-btn new-project-btn-secondary"
              type="button"
              onClick={() => void onPickLocation()}
            >
              Browse
            </button>
          </div>
        </label>

        <label className="new-project-check">
          <input
            type="checkbox"
            checked={createProjectFolder}
            onChange={(event) => setCreateProjectFolder(event.target.checked)}
          />
          Create project folder
        </label>

        <div className="new-project-preview">
          <p>Project root: {projectRootPreview || "(sin ubicacion)"}</p>
          <p>Main file: {mainFilePreview}</p>
        </div>

        {errorMessage && <p className="new-project-error">{errorMessage}</p>}

        <div className="new-project-actions">
          <button
            className="new-project-btn new-project-btn-secondary"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button className="new-project-btn" type="button" onClick={submit} disabled={!canSubmit}>
            {isSubmitting ? "Creating..." : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
