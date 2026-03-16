import { useEffect, useRef } from "react";
import "./UnsavedDialog.css";

type UnsavedDialogProps = {
  /** One or more file names that have unsaved changes */
  fileNames: string[];
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
};

export default function UnsavedDialog({
  fileNames,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const isMultiple = fileNames.length > 1;
  const saveLabel = isMultiple ? "Guardar todo" : "Guardar";

  // focus trap: cerrar con Escape, foco inicial en "Guardar"
  useEffect(() => {
    saveButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="unsaved-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="unsaved-dialog" ref={dialogRef}>
        <div className="unsaved-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>

        <div className="unsaved-body">
          <p id="unsaved-title" className="unsaved-title">
            Cambios sin guardar
          </p>
          {isMultiple ? (
            <>
              <p className="unsaved-message">
                <span className="unsaved-filename">{fileNames.length} archivos</span>{" "}
                tienen cambios sin guardar. ¿Qué quieres hacer?
              </p>
              <ul className="unsaved-filelist">
                {fileNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="unsaved-message">
              <span className="unsaved-filename">{fileNames[0]}</span> tiene
              cambios sin guardar. ¿Qué quieres hacer?
            </p>
          )}
        </div>

        <div className="unsaved-actions">
          <button
            ref={saveButtonRef}
            className="unsaved-btn unsaved-btn-save"
            onClick={() => void onSave()}
          >
            {saveLabel}
          </button>
          <button
            className="unsaved-btn unsaved-btn-discard"
            onClick={onDiscard}
          >
            No guardar
          </button>
          <button
            className="unsaved-btn unsaved-btn-cancel"
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
