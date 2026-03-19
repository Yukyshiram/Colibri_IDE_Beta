import { useEffect, useRef, useState } from "react";
import type { DiagnosticItem, DiagnosticFileGroup } from "../../types/ide";
import { BUILD_DIAGNOSTIC_FILE } from "../../lib/gcc-parser";
import { groupDiagnosticsByFile } from "../../lib/diagnostic-grouping";
import "./BottomPanel.css";

type BottomTab = "output" | "terminal" | "problems" | "console";

type BottomPanelProps = {
  message: string;
  projectPath: string;
  activeTab: BottomTab;
  consoleOutput: string;
  isConsoleRunning: boolean;
  canRerunConsole: boolean;
  terminalOutput: string;
  isRunningTerminalCommand: boolean;
  diagnostics: DiagnosticItem[];
  onSelectTab: (tab: BottomTab) => void;
  onSendConsoleInput: (input: string) => void | Promise<void>;
  onStopConsole: () => void | Promise<void>;
  onClearConsoleOutput: () => void;
  onRerunConsole: () => void | Promise<void>;
  onRunTerminalCommand: (command: string) => void | Promise<void>;
  onClearTerminalOutput: () => void;
  onJumpToDiagnostic: (item: DiagnosticItem) => void;
  onToggleVisibility: () => void;
};

export default function BottomPanel({
  message,
  projectPath,
  activeTab,
  consoleOutput,
  isConsoleRunning,
  canRerunConsole,
  terminalOutput,
  isRunningTerminalCommand,
  diagnostics,
  onSelectTab,
  onSendConsoleInput,
  onStopConsole,
  onClearConsoleOutput,
  onRerunConsole,
  onRunTerminalCommand,
  onClearTerminalOutput,
  onJumpToDiagnostic,
  onToggleVisibility,
}: BottomPanelProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const bottomContentRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollConsoleRef = useRef(true);

  const isNearBottom = (element: HTMLDivElement) => {
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceToBottom <= 24;
  };

  const handleBottomContentScroll = () => {
    const element = bottomContentRef.current;
    if (!element || activeTab !== "console") return;
    shouldAutoScrollConsoleRef.current = isNearBottom(element);
  };

  useEffect(() => {
    if (activeTab !== "console") return;

    const element = bottomContentRef.current;
    if (!element) return;

    if (shouldAutoScrollConsoleRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [consoleOutput, activeTab]);

  useEffect(() => {
    if (activeTab !== "console") return;

    const element = bottomContentRef.current;
    if (!element) return;

    shouldAutoScrollConsoleRef.current = isNearBottom(element);
    if (shouldAutoScrollConsoleRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [activeTab]);

  const toggleGroupCollapse = (fileKey: string) => {
    const updated = new Set(collapsedGroups);
    if (updated.has(fileKey)) {
      updated.delete(fileKey);
    } else {
      updated.add(fileKey);
    }
    setCollapsedGroups(updated);
  };

  const resolveTagClass = (tagLabel: string) => {
    const normalized = tagLabel.toLowerCase();

    if (normalized === "[error]" || normalized === "[stderr]") return "log-tag-error";
    if (normalized === "[warning]") return "log-tag-warning";
    if (normalized === "[consola]" || normalized === "[build & run]") return "log-tag-console";
    if (normalized === "[build]" || normalized === "[run]") return "log-tag-build";
    if (normalized === "[comando]" || normalized === "[cwd]") return "log-tag-command";
    if (normalized === "[directorio]" || normalized === "[proyecto]") return "log-tag-location";
    if (normalized === "[stdout]" || normalized === "[exit code]") return "log-tag-info";
    return "log-tag-default";
  };

  const renderTaggedLog = (text: string) => {
    const lines = text.split("\n");

    return lines.map((line, index) => {
      const tagMatch = line.match(/^(\[[^\]]+\])(.*)$/);
      const isPromptLine = line.startsWith("> ") || line.startsWith("$ ");

      let content: React.ReactNode = line;

      if (tagMatch) {
        const [, tagLabel, rest] = tagMatch;
        content = (
          <>
            <span className={`bottom-log-tag ${resolveTagClass(tagLabel)}`}>{tagLabel}</span>
            <span className="bottom-log-rest">{rest}</span>
          </>
        );
      } else if (isPromptLine) {
        content = <span className="bottom-log-prompt">{line}</span>;
      }

      return (
        <span key={index} className="bottom-log-line">
          {content}
          {index < lines.length - 1 ? "\n" : ""}
        </span>
      );
    });
  };

  const handleSubmitConsoleInput = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = String(formData.get("console-input") ?? "").trim();
    if (!value) return;
    void onSendConsoleInput(value);
    event.currentTarget.reset();
  };

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
          className={`bottom-tab ${activeTab === "problems" ? "active" : ""}`}
          onClick={() => onSelectTab("problems")}
        >
          Problems
          {diagnostics.length > 0 && (
            <span className="bottom-tab-badge">
              {diagnostics.filter((d) => d.severity === "error").length || diagnostics.length}
            </span>
          )}
        </button>
        <button
          className={`bottom-tab ${activeTab === "console" ? "active" : ""}`}
          onClick={() => onSelectTab("console")}
        >
          Consola
          {isConsoleRunning && <span className="bottom-tab-live">RUN</span>}
        </button>
        <button
          className={`bottom-tab ${activeTab === "terminal" ? "active" : ""}`}
          onClick={() => onSelectTab("terminal")}
        >
          Terminal
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

      <div
        ref={bottomContentRef}
        className="bottom-panel-content"
        onScroll={handleBottomContentScroll}
      >
        {activeTab === "output" ? (
          <>
            <pre className="bottom-panel-pre">{renderTaggedLog(message)}</pre>
            <p>{projectPath ? `[Proyecto] ${projectPath}` : "[Proyecto] Ninguno"}</p>
          </>
        ) : activeTab === "problems" ? (
          <div className="diagnostics-panel">
            {diagnostics.length === 0 ? (
              <p className="diagnostics-empty">No se encontraron problemas.</p>
            ) : (
              <>
                <p className="diagnostics-summary">
                  {diagnostics.filter((d) => d.severity === "error").length} error(es) &middot;{" "}
                  {diagnostics.filter((d) => d.severity === "warning").length} advertencia(s)
                </p>
                <div className="diagnostics-groups">
                  {groupDiagnosticsByFile(diagnostics).map((group: DiagnosticFileGroup) => {
                    const isCollapsed = collapsedGroups.has(group.file);

                    return (
                      <div key={group.file} className="diagnostic-group">
                        <div
                          className={`diagnostic-group-header ${group.isGlobal ? "diagnostic-group-global" : ""}`}
                          onClick={() => toggleGroupCollapse(group.file)}
                        >
                          <span className="diagnostic-group-toggle">
                            {isCollapsed ? "▶" : "▼"}
                          </span>
                          <span className="diagnostic-group-name">{group.displayName}</span>
                          <span className="diagnostic-group-counts">
                            {group.errors.length > 0 && (
                              <span className="diagnostic-count-error">{group.errors.length}</span>
                            )}
                            {group.warnings.length > 0 && (
                              <span className="diagnostic-count-warning">{group.warnings.length}</span>
                            )}
                          </span>
                        </div>

                        {!isCollapsed && (
                          <ul className="diagnostic-group-items">
                            {[...group.errors, ...group.warnings].map((item, i) => (
                              <li
                                key={i}
                                className={`diagnostic-item diagnostic-${item.severity}${
                                  item.navigable ? "" : " diagnostic-global"
                                }`}
                                onClick={() => onJumpToDiagnostic(item)}
                                title={
                                  item.navigable
                                    ? `${item.file}:${item.line}:${item.column}`
                                    : "Diagnóstico global de build/linker"
                                }
                              >
                                <span className="diagnostic-icon">
                                  {item.severity === "error" ? "✕" : "⚠"}
                                </span>
                                <span className="diagnostic-message">{item.message}</span>
                                <span className="diagnostic-location">
                                  {item.navigable && item.file !== BUILD_DIAGNOSTIC_FILE
                                    ? `${item.file.split(/[\\/]/).pop()}:${item.line}:${item.column}`
                                    : "build:global"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : activeTab === "console" ? (
          <>
            <div className="console-controls-row">
              <button
                className="terminal-run-btn"
                onClick={() => void onRerunConsole()}
                disabled={!canRerunConsole || isConsoleRunning}
              >
                Re-ejecutar
              </button>
              <button
                className="terminal-run-btn"
                onClick={() => void onStopConsole()}
                disabled={!isConsoleRunning}
              >
                Detener
              </button>
              <button className="terminal-run-btn" onClick={onClearConsoleOutput}>
                Limpiar
              </button>
            </div>

            <pre className="bottom-panel-pre bottom-panel-terminal-pre">{renderTaggedLog(consoleOutput)}</pre>

            <form className="terminal-input-row" onSubmit={handleSubmitConsoleInput}>
              <span className="terminal-prefix" aria-hidden="true">&gt;</span>
              <input
                name="console-input"
                className="terminal-input"
                placeholder={isConsoleRunning ? "Escribe input para stdin y presiona Enter" : "Ejecuta un programa para enviar input"}
                disabled={!isConsoleRunning}
                autoComplete="off"
              />
              <button type="submit" className="terminal-run-btn" disabled={!isConsoleRunning}>
                Enviar
              </button>
            </form>

            <p>
              {projectPath
                ? `[Consola] ${isConsoleRunning ? "Proceso en ejecución" : "Sin proceso activo"}`
                : "[Consola] Sin proyecto"}
            </p>
          </>
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

            <pre className="bottom-panel-pre bottom-panel-terminal-pre">{renderTaggedLog(terminalOutput)}</pre>
            <p>{projectPath ? `[Directorio] ${projectPath}` : "[Directorio] Ninguno"}</p>
          </>
        )}
      </div>
    </section>
  );
}
