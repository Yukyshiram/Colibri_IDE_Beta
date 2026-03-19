import { useState } from "react";
import "./SidebarViews.css";

type ClangFormatToolStatus = {
  status: "system-installed" | "colibri-installed" | "not-installed";
  system_path: string | null;
  managed_path: string | null;
  active_path: string | null;
};

type ToolsViewProps = {
  clangFormatStatus: ClangFormatToolStatus;
  isCheckingClangFormat: boolean;
  isInstallingClangFormat: boolean;
  onReloadClangFormatStatus: () => void | Promise<void>;
  onUseExistingClangFormat: () => void | Promise<void>;
};

export default function ToolsView({
  clangFormatStatus,
  isCheckingClangFormat,
  isInstallingClangFormat,
  onReloadClangFormatStatus,
  onUseExistingClangFormat,
}: ToolsViewProps) {
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  const clangStatusLabel =
    clangFormatStatus.status === "not-installed" ? "No instalado" : "Instalado";

  const clangStatusClass =
    clangFormatStatus.status === "not-installed" ? "status-missing" : "status-installed";

  return (
    <aside className="sidebar-view-shell" aria-label="Tools view">
      <header className="sidebar-view-header">
        <h2>Tools</h2>
      </header>

      <div className="sidebar-view-content" aria-label="Herramienta clang-format">
        <button
          type="button"
          className="tools-extension-row"
          onClick={() => setIsInfoModalOpen(true)}
          aria-label="Ver informacion de clang-format"
        >
          <span className="tools-extension-icon" aria-hidden="true">
            wrench
          </span>
          <div className="tools-extension-meta">
            <strong>clang-format</strong>
            <small>Formatea codigo C/C++</small>
          </div>
          <span className={`sidebar-tool-status ${clangStatusClass}`}>{clangStatusLabel}</span>
        </button>
      </div>

      {isInfoModalOpen && (
        <div
          className="tools-info-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsInfoModalOpen(false);
            }
          }}
        >
          <section className="tools-info-modal" role="dialog" aria-modal="true" aria-label="Info clang-format">
            <button
              type="button"
              className="tools-info-modal-close"
              onClick={() => setIsInfoModalOpen(false)}
              aria-label="Cerrar"
            >
              x
            </button>
            <div className="tools-info-modal-icon" aria-hidden="true">
              wrench
            </div>
            <h3>clang-format</h3>
            <span className={`sidebar-tool-status ${clangStatusClass}`}>{clangStatusLabel}</span>

            <div className="tools-info-modal-actions">
              <button
                className="sidebar-view-btn sidebar-view-btn-primary"
                onClick={() => void onUseExistingClangFormat()}
                disabled={isInstallingClangFormat}
              >
                {isInstallingClangFormat ? "Buscando..." : "Usar instalacion existente"}
              </button>

              <button className="sidebar-view-btn sidebar-view-btn-secondary" disabled>
                Instalar en Colibri (proximamente)
              </button>

              <button
                className="sidebar-view-btn sidebar-view-btn-ghost"
                onClick={() => void onReloadClangFormatStatus()}
                disabled={isCheckingClangFormat || isInstallingClangFormat}
              >
                {isCheckingClangFormat ? "Detectando..." : "Recargar"}
              </button>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
