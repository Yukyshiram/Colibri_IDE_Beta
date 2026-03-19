import { useEffect, useRef, useState } from "react";
import "./TopBar.css";

export type NewMenuAction =
  | "empty-file"
  | "c-file"
  | "cpp-file"
  | "header-file"
  | "c-project"
  | "cpp-project";

type TopBarProps = {
  onOpenFolder: () => void;
  onCreateFromNewMenu: (action: NewMenuAction) => void | Promise<void>;
  onRefreshExplorer: () => void;
  onToggleTerminalPanel: () => void;
  onOpenSettings: () => void;
  onSaveFile: () => void | Promise<boolean>;
  onCompileFile: () => void | Promise<void>;
  onRunFile: () => void | Promise<void>;
  onBuildAndRun: () => void | Promise<void>;
};

export default function TopBar({
  onOpenFolder,
  onCreateFromNewMenu,
  onRefreshExplorer,
  onToggleTerminalPanel,
  onOpenSettings,
  onSaveFile,
  onCompileFile,
  onRunFile,
  onBuildAndRun,
}: TopBarProps) {
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isNewMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!newMenuRef.current) return;
      if (newMenuRef.current.contains(event.target as Node)) return;
      setIsNewMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNewMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNewMenuOpen]);

  const runNewAction = (action: NewMenuAction) => {
    setIsNewMenuOpen(false);
    void onCreateFromNewMenu(action);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">Colibrí IDE</span>

        <nav className="topbar-menu">
          <div className="topbar-dropdown" ref={newMenuRef}>
            <button
              className={`topbar-new-btn ${isNewMenuOpen ? "open" : ""}`}
              onClick={() => setIsNewMenuOpen((prev) => !prev)}
              aria-expanded={isNewMenuOpen}
              aria-haspopup="menu"
            >
              New
            </button>
            {isNewMenuOpen && (
              <div className="topbar-dropdown-menu" role="menu" aria-label="New menu">
                <button role="menuitem" onClick={() => runNewAction("empty-file")}>Empty file</button>
                <button role="menuitem" onClick={() => runNewAction("c-file")}>C file</button>
                <button role="menuitem" onClick={() => runNewAction("cpp-file")}>C++ file</button>
                <button role="menuitem" onClick={() => runNewAction("header-file")}>Header file</button>
                <div className="topbar-dropdown-separator" />
                <button role="menuitem" onClick={() => runNewAction("c-project")}>Project (C)</button>
                <button role="menuitem" onClick={() => runNewAction("cpp-project")}>Project (C++)</button>
              </div>
            )}
          </div>
          <button onClick={onOpenFolder}>Abrir carpeta</button>
          <button onClick={onRefreshExplorer}>Refrescar</button>
          <button onClick={onToggleTerminalPanel}>Terminal</button>
          <button onClick={onOpenSettings}>Settings</button>
          <button onClick={onSaveFile}>Guardar</button>
          <button onClick={onCompileFile}>Build</button>
          <button onClick={onRunFile}>Run</button>
          <button className="topbar-primary-action" onClick={onBuildAndRun}>
            Build &amp; Run
          </button>
        </nav>
      </div>
    </header>
  );
}