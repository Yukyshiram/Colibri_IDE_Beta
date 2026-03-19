import { useEffect, useMemo, useState } from "react";
import type { HeaderGenerationStyle } from "../../lib/cpp-class-templates";
import "./NewClassDialog.css";

export type NewClassDialogSubmitPayload = {
  className: string;
  namespaceName: string;
  baseClass: string;
  targetDirectory: string;
  generateHeader: boolean;
  generateSource: boolean;
  headerStyle: HeaderGenerationStyle;
  generateConstructor: boolean;
  generateDestructor: boolean;
};

type NewClassDialogProps = {
  isOpen: boolean;
  targetDirectory: string;
  isSubmitting: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onPickDirectory: () => void | Promise<void>;
  onSubmit: (payload: NewClassDialogSubmitPayload) => void | Promise<void>;
};

export default function NewClassDialog({
  isOpen,
  targetDirectory,
  isSubmitting,
  errorMessage,
  onCancel,
  onPickDirectory,
  onSubmit,
}: NewClassDialogProps) {
  const [className, setClassName] = useState("");
  const [namespaceName, setNamespaceName] = useState("");
  const [baseClass, setBaseClass] = useState("");
  const [generateHeader, setGenerateHeader] = useState(true);
  const [generateSource, setGenerateSource] = useState(true);
  const [headerStyle, setHeaderStyle] = useState<HeaderGenerationStyle>("pragma-once");
  const [generateConstructor, setGenerateConstructor] = useState(true);
  const [generateDestructor, setGenerateDestructor] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setClassName("");
    setNamespaceName("");
    setBaseClass("");
    setGenerateHeader(true);
    setGenerateSource(true);
    setHeaderStyle("pragma-once");
    setGenerateConstructor(true);
    setGenerateDestructor(false);
  }, [isOpen]);

  const canChooseHeaderStyle = generateHeader;
  const canSubmit = useMemo(
    () => !isSubmitting && className.trim().length > 0,
    [isSubmitting, className]
  );

  if (!isOpen) return null;

  const nextHeaderPath = targetDirectory ? `${targetDirectory}\\${className.trim() || "ClassName"}.h` : "";
  const nextSourcePath = targetDirectory ? `${targetDirectory}\\${className.trim() || "ClassName"}.cpp` : "";

  const submit = () => {
    if (!canSubmit) return;

    void onSubmit({
      className: className.trim(),
      namespaceName: namespaceName.trim(),
      baseClass: baseClass.trim(),
      targetDirectory: targetDirectory.trim(),
      generateHeader,
      generateSource,
      headerStyle,
      generateConstructor,
      generateDestructor,
    });
  };

  return (
    <div className="new-class-overlay" onClick={onCancel}>
      <div
        className="new-class-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create New C++ Class"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>New C++ Class</h2>

        <label className="new-class-field">
          <span>Class name</span>
          <input
            className="new-class-input"
            value={className}
            onChange={(event) => setClassName(event.target.value)}
            placeholder="MyClass"
            autoFocus
          />
        </label>

        <div className="new-class-grid-two">
          <label className="new-class-field">
            <span>Namespace (optional)</span>
            <input
              className="new-class-input"
              value={namespaceName}
              onChange={(event) => setNamespaceName(event.target.value)}
              placeholder="app::core"
            />
          </label>

          <label className="new-class-field">
            <span>Base class (optional)</span>
            <input
              className="new-class-input"
              value={baseClass}
              onChange={(event) => setBaseClass(event.target.value)}
              placeholder="BaseWidget"
            />
          </label>
        </div>

        <label className="new-class-field">
          <span>Target folder</span>
          <div className="new-class-path-row">
            <input className="new-class-input" value={targetDirectory} readOnly />
            <button
              className="new-class-btn new-class-btn-secondary"
              onClick={() => void onPickDirectory()}
              type="button"
            >
              Browse
            </button>
          </div>
        </label>

        <div className="new-class-options-grid">
          <label className="new-class-check">
            <input
              type="checkbox"
              checked={generateHeader}
              onChange={(event) => setGenerateHeader(event.target.checked)}
            />
            Generate header (.h)
          </label>

          <label className="new-class-check">
            <input
              type="checkbox"
              checked={generateSource}
              onChange={(event) => setGenerateSource(event.target.checked)}
            />
            Generate source (.cpp)
          </label>

          <label className="new-class-check">
            <input
              type="checkbox"
              checked={generateConstructor}
              onChange={(event) => setGenerateConstructor(event.target.checked)}
            />
            Generate constructor
          </label>

          <label className="new-class-check">
            <input
              type="checkbox"
              checked={generateDestructor}
              onChange={(event) => setGenerateDestructor(event.target.checked)}
            />
            Generate destructor
          </label>
        </div>

        <label className="new-class-field">
          <span>Header style</span>
          <select
            className="new-class-input"
            value={headerStyle}
            onChange={(event) => setHeaderStyle(event.target.value as HeaderGenerationStyle)}
            disabled={!canChooseHeaderStyle}
          >
            <option value="pragma-once">#pragma once</option>
            <option value="include-guards">Include guards</option>
          </select>
        </label>

        <div className="new-class-preview">
          <p>Preview:</p>
          {generateHeader && <p>{nextHeaderPath}</p>}
          {generateSource && <p>{nextSourcePath}</p>}
          {!generateHeader && !generateSource && <p>No files selected.</p>}
        </div>

        {errorMessage && <p className="new-class-error">{errorMessage}</p>}

        <div className="new-class-actions">
          <button className="new-class-btn new-class-btn-secondary" onClick={onCancel} type="button" disabled={isSubmitting}>
            Cancel
          </button>
          <button className="new-class-btn" onClick={submit} type="button" disabled={!canSubmit}>
            {isSubmitting ? "Creating..." : "Create class"}
          </button>
        </div>
      </div>
    </div>
  );
}
