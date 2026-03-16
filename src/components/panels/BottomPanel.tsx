import type { DiagnosticItem } from "../../types/ide";
import "./BottomPanel.css";

type BottomTab = "output" | "terminal" | "problemas";

type BottomPanelProps = {
  message: string;
  projectPath: string;
  activeTab: BottomTab;
  terminalOutput: string;
  isRunningTerminalCommand: boolean;
  diagnostics: DiagnosticItem[];
  onSelectTab: (tab: BottomTab) => void;
  onRunTerminalCommand: (command: string) => void | Promise<void>;
  onClearTerminalOutput: () => void;
  onJumpToDiagnostic: (item: DiagnosticItem) => void;
  onToggleVisibility: () => void;
};

export default function BottomPanel({
  message,
  projectPath,
  activeTab,
  terminalOutput,
  isRunningTerminalCommand,
  diagnostics,
  onSelectTab,
  onRunTerminalCommand,
  onClearTerminalOutput,
  onJumpToDiagnostic,
  onToggleVisibility,
}: BottomPanelProps) {
  const handleSubmitTerminalCommand = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const command = String(formData.get("terminal-command") ?? "").trim();
    if (!command) return;
    void onRunTerminalCommand(command);
    event.currentTarget.reset();
  };

  return (
    <section className="bottom-panel">
      <div className="bottom-panel-tabs">
        <button
          className={`bottom-tab ${activeTab === "output" ? "active" : ""}`}
          onClick={() => onSelectTab("output")}
        >
          Output
        </button>
        <button
          className={`bottom-tab ${activeTab === "terminal" ? "active" : ""}`}
          onClick={() => onSelectTab("terminal")}
        >
          Terminal
        </button>
        <button
          className={`bottom-tab ${activeTab === "problemas" ? "active" : ""}`}
          onClick={() => onSelectTab("problemas")}
        >
          Problemas
          {diagnostics.length > 0 && (
            <span className="bottom-tab-badge">{diagnostics.filter((d) => d.severity === "error").length || diagnostics.length}</span>
          )}
        </button>
        <div className="bottom-panel-spacer" />
        {activeTab === "terminal" && (
          <button className="bottom-tab bottom-tab-action" onClick={onClearTerminalOutput}>
            Limpiar
          </button>
        )}
        <button className="bottom-tab bottom-tab-action" onClick={onToggleVisibility}>
          Ocultar
        </button>
      </div>

      <div className="bottom-panel-content">
        {activeTab === "output" ? (
          <>
            <pre className="bottom-panel-pre">{message}</pre>
            <p>{projectPath ? `[Proyecto] ${projectPath}` : "[Proyecto] Ninguno"}</p>
          </>
        ) : activeTab === "problemas" ? (
          <div className="diagnostics-panel">
            {diagnostics.length === 0 ? (
              <p className="diagnostics-empty">No se encontraron problemas.</p>
            ) : (
              <>
                <p className="diagnostics-summary">
                  {diagnostics.filter((d) => d.severity === "error").length} error(es) &middot;{" "}
                  {diagnostics.filter((d) => d.severity === "warning").length} advertencia(s)
                </p>
                <ul className="diagnostics-list">
                  {diagnostics.map((item, i) => (
                    <li
                      key={i}
                      className={`diagnostic-item diagnostic-${item.severity}`}
                      onClick={() => onJumpToDiagnostic(item)}
                      title={`${item.file}:${item.line}:${item.col}`}
                    >
                      <span className="diagnostic-icon">
                        {item.severity === "error" ? "✕" : item.severity === "warning" ? "⚠" : "ℹ"}
                      </span>
                      <span className="diagnostic-message">{item.message}</span>
                      <span className="diagnostic-location">
                        {item.file.split(/[\\/]/).pop()}:{item.line}:{item.col}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <>
            <form className="terminal-input-row" onSubmit={handleSubmitTerminalCommand}>
              <span className="terminal-prefix" aria-hidden="true">$</span>
              <input
                name="terminal-command"
                className="terminal-input"
                placeholder={projectPath ? "Escribe un comando..." : "Abre un proyecto para usar la terminal"}
                disabled={!projectPath || isRunningTerminalCommand}
                autoComplete="off"
              />
              <button
                type="submit"
                className="terminal-run-btn"
                disabled={!projectPath || isRunningTerminalCommand}
              >
                {isRunningTerminalCommand ? "Ejecutando..." : "Ejecutar"}
              </button>
            </form>

            <pre className="bottom-panel-pre bottom-panel-terminal-pre">{terminalOutput}</pre>
            <p>{projectPath ? `[Directorio] ${projectPath}` : "[Directorio] Ninguno"}</p>
          </>
        )}
      </div>
    </section>
  );
}