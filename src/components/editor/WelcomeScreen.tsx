import "./WelcomeScreen.css";
import type { RecentProject } from "../../types/ide";

type WelcomeScreenProps = {
  mode: "initial" | "project";
  onOpenFolder?: () => void | Promise<void>;
  onNewFile?: () => void | Promise<void>;
  projectName?: string;
  recentProjects?: RecentProject[];
  lastProjectPath?: string;
  onOpenRecentProject?: (path: string) => void | Promise<void>;
  invalidRecentPaths?: Set<string>;
  onRemoveRecentProject?: (path: string) => void;
};

export default function WelcomeScreen({
  mode,
  onOpenFolder,
  onNewFile,
  projectName,
  recentProjects = [],
  lastProjectPath,
  onOpenRecentProject,
  invalidRecentPaths = new Set(),
  onRemoveRecentProject,
}: WelcomeScreenProps) {
  const isInitial = mode === "initial";

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
        <img
          className="welcome-logo"
          src="/logo_V2.png"
          alt="Logo de Colibri IDE"
        />
        <h1 className="welcome-title">Colibri IDE</h1>
        <p className="welcome-subtitle">
          {isInitial
            ? "Un IDE ligero para C, C++ y desarrollo nativo"
            : `Proyecto abierto: ${projectName ?? "Proyecto"}`}
        </p>

        <div className="welcome-actions">
          {isInitial && onOpenFolder && (
            <button className="welcome-button" onClick={onOpenFolder}>
              Abrir carpeta
            </button>
          )}

          {!isInitial && onNewFile && (
            <button className="welcome-button" onClick={onNewFile}>
              Nuevo archivo
            </button>
          )}
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
            <h2>Reciente</h2>
            {recentProjects.length === 0 ? (
              <p className="welcome-recent-empty">
                Aun no hay proyectos recientes.
              </p>
            ) : (
              <ul className="welcome-recent-list">
                {recentProjects.map((project) => {
                  const isInvalid = invalidRecentPaths.has(project.path);
                  const isLastProject = project.path === lastProjectPath;
                  return (
                    <li key={project.path} className="welcome-recent-li">
                      <button
                        className={`welcome-recent-item${isInvalid ? " welcome-recent-item-invalid" : ""}${isLastProject ? " welcome-recent-item-last" : ""}`}
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
                            {isInvalid && (
                              <span className="welcome-recent-invalid-badge">No encontrado</span>
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
    </section>
  );
}
