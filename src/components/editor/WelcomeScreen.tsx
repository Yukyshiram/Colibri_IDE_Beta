import "./WelcomeScreen.css";
import type { RecentProject } from "../../types/ide";
import { useState } from "react";

type WelcomeScreenProps = {
  mode: "initial" | "project";
  onOpenFolder?: () => void | Promise<void>;
  onOpenNewProjectWizard?: () => void | Promise<void>;
  onNewFile?: () => void | Promise<void>;
  projectName?: string;
  recentProjects?: RecentProject[];
  recentProjectsForModal?: RecentProject[];
  missingRecentPaths?: Set<string>;
  lastProjectPath?: string;
  onOpenRecentProject?: (path: string) => void | Promise<void>;
  onRemoveRecentProject?: (path: string) => void;
};

export default function WelcomeScreen({
  mode,
  onOpenFolder,
  onOpenNewProjectWizard,
  onNewFile,
  projectName,
  recentProjects = [],
  recentProjectsForModal = [],
  missingRecentPaths = new Set(),
  lastProjectPath,
  onOpenRecentProject,
  onRemoveRecentProject,
}: WelcomeScreenProps) {
  const isInitial = mode === "initial";
  const [isRecentAccessModalOpen, setIsRecentAccessModalOpen] = useState(false);

  const shortenPath = (pathValue: string) => {
    if (pathValue.length <= 54) {
      return pathValue;
    }

    const start = pathValue.slice(0, 26);
    const end = pathValue.slice(-24);
    return `${start}...${end}`;
  };

  const formatRelativeDate = (timestamp: number): string => {
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);

    if (diffMin < 1) return "Hace un momento";
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHour < 24) return `Hace ${diffHour} h`;
    if (diffDay === 1) return "Ayer";
    if (diffDay < 7) return `Hace ${diffDay} días`;
    if (diffWeek < 5) return `Hace ${diffWeek} sem`;
    if (diffMonth < 12) return `Hace ${diffMonth} mes${diffMonth > 1 ? "es" : ""}`;
    const diffYear = Math.floor(diffDay / 365);
    return `Hace ${diffYear} año${diffYear > 1 ? "s" : ""}`;
  };

  return (
    <section
      className={`welcome-screen ${isInitial ? "welcome-screen-initial" : "welcome-screen-project"}`}
      aria-label="Pantalla de bienvenida"
    >
      <div className="welcome-card">
        <div className="welcome-hero">
          <div className="welcome-hero-content">
            <h1 className="welcome-title">
              Colibri IDE
              <span className="welcome-title-beta" aria-label="Version beta">
                Beta V0.3
              </span>
            </h1>
            <p className="welcome-subtitle">
              {isInitial
                ? "Un IDE ligero para C, C++ y desarrollo nativo"
                : `Proyecto abierto: ${projectName ?? "Proyecto"}`}
            </p>
            {isInitial && <p className="welcome-credit">By: Im_JVallejo</p>}

            <div className="welcome-actions">
              {isInitial && onOpenFolder && (
                <button className="welcome-button" onClick={onOpenFolder}>
                  Abrir proyecto/carpeta
                </button>
              )}

              {isInitial && onOpenNewProjectWizard && (
                <button
                  className="welcome-button welcome-button-secondary"
                  onClick={() => void onOpenNewProjectWizard()}
                >
                  Nuevo proyecto
                </button>
              )}

              {!isInitial && onNewFile && (
                <button className="welcome-button" onClick={onNewFile}>
                  Nuevo archivo
                </button>
              )}
            </div>
          </div>

          <div className="welcome-logo-shell" aria-hidden="true">
            <img
              className="welcome-logo"
              src="/logo_V2.png"
              alt="Logo de Colibri IDE"
            />
          </div>
        </div>

        <div className="welcome-tips">
          <h2>Tips rapidos</h2>
          <ul>
            <li>Ctrl + S -&gt; Guardar archivo</li>
            <li>Build -&gt; Compilar</li>
            <li>Run -&gt; Ejecutar</li>
            <li>Build &amp; Run -&gt; Compilar y ejecutar</li>
          </ul>
        </div>

        {isInitial && (
          <div className="welcome-recent">
            <div className="welcome-recent-header">
              <h2>Reciente</h2>
              {recentProjectsForModal.length > 0 && (
                <button
                  className="welcome-button welcome-button-secondary welcome-recent-modal-btn"
                  onClick={() => setIsRecentAccessModalOpen(true)}
                >
                  Accedidos recientemente
                </button>
              )}
            </div>
            {recentProjects.length === 0 ? (
              <p className="welcome-recent-empty">
                Aun no hay proyectos recientes.
              </p>
            ) : (
              <ul className="welcome-recent-list">
                {recentProjects.map((project) => {
                  const isLastProject = project.path === lastProjectPath;
                  return (
                    <li key={project.path} className="welcome-recent-li">
                      <button
                        className={`welcome-recent-item${isLastProject ? " welcome-recent-item-last" : ""}`}
                        onClick={() => void onOpenRecentProject?.(project.path)}
                        title={project.path}
                      >
                        <span className="welcome-recent-item-icon" aria-hidden="true">📁</span>
                        <span className="welcome-recent-item-body">
                          <span className="welcome-recent-name">
                            {project.name}
                            {isLastProject && (
                              <span className="welcome-recent-last-badge">Ultimo</span>
                            )}
                          </span>
                          <span className="welcome-recent-path" title={project.path}>
                            {shortenPath(project.path)}
                          </span>
                          <span className="welcome-recent-date">
                            {formatRelativeDate(project.lastOpenedAt)}
                          </span>
                        </span>
                      </button>
                      <button
                        className="welcome-recent-remove"
                        onClick={() => onRemoveRecentProject?.(project.path)}
                        title="Eliminar de recientes"
                        aria-label={`Eliminar ${project.name} de recientes`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {isInitial && isRecentAccessModalOpen && (
        <div className="welcome-modal-overlay" onClick={() => setIsRecentAccessModalOpen(false)}>
          <div className="welcome-modal welcome-modal-recent" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Accedidos recientemente (10 últimos)</h2>

            {recentProjectsForModal.length === 0 ? (
              <p className="welcome-recent-empty">Aun no hay proyectos recientes.</p>
            ) : (
              <ul className="welcome-recent-list welcome-recent-list-modal">
                {recentProjectsForModal.map((project) => {
                  const isLastProject = project.path === lastProjectPath;
                  const isMissing = missingRecentPaths.has(project.path);

                  return (
                    <li key={project.path} className="welcome-recent-li">
                      <button
                        className={`welcome-recent-item${isLastProject ? " welcome-recent-item-last" : ""}${isMissing ? " welcome-recent-item-missing" : ""}`}
                        onClick={() => void onOpenRecentProject?.(project.path)}
                        title={project.path}
                      >
                        <span className="welcome-recent-item-icon" aria-hidden="true">📁</span>
                        <span className="welcome-recent-item-body">
                          <span className="welcome-recent-name">
                            {project.name}
                            {isLastProject && (
                              <span className="welcome-recent-last-badge">Ultimo</span>
                            )}
                            {isMissing && (
                              <span className="welcome-recent-missing-badge">No existe</span>
                            )}
                          </span>
                          <span className="welcome-recent-path" title={project.path}>
                            {shortenPath(project.path)}
                          </span>
                          <span className="welcome-recent-date">
                            {formatRelativeDate(project.lastOpenedAt)}
                          </span>
                        </span>
                      </button>
                      <button
                        className="welcome-recent-remove"
                        onClick={() => onRemoveRecentProject?.(project.path)}
                        title="Eliminar de recientes"
                        aria-label={`Eliminar ${project.name} de recientes`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="welcome-modal-actions">
              <button
                className="welcome-button welcome-button-secondary"
                onClick={() => setIsRecentAccessModalOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
