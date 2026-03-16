import "./TopBar.css";

type TopBarProps = {
  onOpenFolder: () => void;
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
  onRefreshExplorer,
  onToggleTerminalPanel,
  onOpenSettings,
  onSaveFile,
  onCompileFile,
  onRunFile,
  onBuildAndRun,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">Colibrí IDE</span>

        <nav className="topbar-menu">
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