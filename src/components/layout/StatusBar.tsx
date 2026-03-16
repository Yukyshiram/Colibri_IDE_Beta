import type { IDEFile, EditorCursorPosition } from "../../types/ide";
import "./StatusBar.css";

type StatusBarProps = {
  activeFile?: IDEFile;
  cursorPosition?: EditorCursorPosition;
};

const LANGUAGE_LABEL: Record<string, string> = {
  c: "C",
  cpp: "C++",
  markdown: "Markdown",
  plaintext: "Plain Text",
};

export default function StatusBar({
  activeFile,
  cursorPosition = { line: 1, column: 1 },
}: StatusBarProps) {
  const langKey = activeFile?.language;
  const langLabel = langKey ? (LANGUAGE_LABEL[langKey] ?? langKey.toUpperCase()) : null;
  const isDirty = activeFile?.isDirty ?? false;

  return (
    <footer className="statusbar" aria-label="Barra de estado">
      <div className="statusbar-left">
        {langKey && (
          <span className={`statusbar-badge statusbar-lang statusbar-lang-${langKey}`}>
            {langLabel}
          </span>
        )}
        <StatusSep />
        <span className="statusbar-badge">UTF-8</span>
        <StatusSep />
        <span className="statusbar-badge">LF</span>
      </div>

      <div className="statusbar-right">
        {activeFile ? (
          <>
            <span className="statusbar-filename" title={activeFile.path}>
              {activeFile.name}
            </span>
            <StatusSep />
            <span
              className={`statusbar-badge statusbar-state ${
                isDirty ? "statusbar-state-modified" : "statusbar-state-saved"
              }`}
            >
              {isDirty ? "Modified" : "Saved"}
            </span>
            <StatusSep />
          </>
        ) : (
          <>
            <span className="statusbar-no-file">No file selected</span>
            <StatusSep />
          </>
        )}
        <span className="statusbar-cursor">
          Ln {cursorPosition.line}, Col {cursorPosition.column}
        </span>
      </div>
    </footer>
  );
}

function StatusSep() {
  return <span className="statusbar-sep" aria-hidden="true" />;
}
