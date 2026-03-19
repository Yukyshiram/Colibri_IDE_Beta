import "./WelcomeScreen.css";
import type { RecentProject } from "../../types/ide";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

type CreateProjectPayload = {
  language: "c" | "cpp";
  projectName: string;
  baseDirectory: string;
};

type NewProjectValidationErrors = {
  name?: string;
  path?: string;
  submit?: string;
};

type WelcomeScreenProps = {
  mode: "initial" | "project";
  onOpenFolder?: () => void | Promise<void>;
  onCreateProject?: (payload: CreateProjectPayload) => boolean | Promise<boolean>;
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
  onCreateProject,
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
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isRecentAccessModalOpen, setIsRecentAccessModalOpen] = useState(false);
  const [projectLanguage, setProjectLanguage] = useState<"c" | "cpp">("c");
  const [projectNameInput, setProjectNameInput] = useState("nuevo-proyecto-c");
  const [projectBasePath, setProjectBasePath] = useState("");
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const [validationErrors, setValidationErrors] = useState<NewProjectValidationErrors>({});

  const trimmedProjectName = projectNameInput.trim();
  const canCreateProject = !isSubmittingProject;

  const handleOpenNewProjectModal = () => {
    setProjectLanguage("c");
    setProjectNameInput("nuevo-proyecto-c");
    setProjectBasePath("");
    setValidationErrors({});
    setIsNewProjectModalOpen(true);
  };

  const validateProjectForm = (): NewProjectValidationErrors => {
    const nextErrors: NewProjectValidationErrors = {};

    if (!projectBasePath.trim()) {
      nextErrors.path = "Selecciona una ruta para crear el proyecto.";
    }

    if (!trimmedProjectName) {
      nextErrors.name = "El nombre del proyecto es obligatorio.";
      return nextErrors;
    }

    if (trimmedProjectName.length < 3) {
      nextErrors.name = "El nombre debe tener al menos 3 caracteres.";
      return nextErrors;
    }

    if (trimmedProjectName === "." || trimmedProjectName === "..") {
      nextErrors.name = "Ese nombre no es válido para una carpeta de proyecto.";
      return nextErrors;
    }

    if (/[<>:\"/\\|?*\x00-\x1F]/.test(trimmedProjectName)) {
      nextErrors.name = "El nombre contiene caracteres no válidos (<>:\"/\\|?*).";
      return nextErrors;
    }

    if (/[.\s]$/.test(trimmedProjectName)) {
      nextErrors.name = "El nombre no debe terminar en espacio o punto.";
      return nextErrors;
    }

    return nextErrors;
  };

  const handlePickProjectPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Selecciona dónde crear el proyecto",
    });

    if (!selected || Array.isArray(selected)) return;
    setProjectBasePath(selected);
    setValidationErrors((prev) => ({ ...prev, path: undefined, submit: undefined }));
  };

  const handleConfirmCreateProject = async () => {
    if (!onCreateProject || !canCreateProject) return;

    const errors = validateProjectForm();
    setValidationErrors(errors);
    if (errors.name || errors.path) return;

    setIsSubmittingProject(true);
    try {
      const created = await onCreateProject({
        language: projectLanguage,
        projectName: trimmedProjectName,
        baseDirectory: projectBasePath,
      });

      if (created) {
        setIsNewProjectModalOpen(false);
      } else {
        setValidationErrors((prev) => ({
          ...prev,
          submit: "No se pudo crear el proyecto. Revisa nombre/ruta e intenta de nuevo.",
        }));
      }
    } catch {
      setValidationErrors((prev) => ({
        ...prev,
        submit: "Ocurrió un error al crear el proyecto. Intenta nuevamente.",
      }));
    } finally {
      setIsSubmittingProject(false);
    }
  };

  const nextProjectPath =
    projectBasePath && trimmedProjectName
      ? `${projectBasePath}${projectBasePath.match(/[\\/]$/) ? "" : "\\"}${trimmedProjectName}`
      : "";

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
                Beta V0.2
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

              {isInitial && onCreateProject && (
                <button
                  className="welcome-button welcome-button-secondary"
                  onClick={handleOpenNewProjectModal}
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

      {isInitial && isNewProjectModalOpen && onCreateProject && (
        <div className="welcome-modal-overlay" onClick={() => setIsNewProjectModalOpen(false)}>
          <div className="welcome-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Nuevo proyecto</h2>

            <label className="welcome-modal-field">
              <span>Nombre del proyecto</span>
              <input
                className={`welcome-modal-input ${validationErrors.name ? "welcome-modal-input-error" : ""}`}
                value={projectNameInput}
                onChange={(e) => {
                  setProjectNameInput(e.target.value);
                  setValidationErrors((prev) => ({ ...prev, name: undefined, submit: undefined }));
                }}
                placeholder="mi-proyecto-c"
                autoFocus
              />
              {validationErrors.name && (
                <span className="welcome-modal-error">{validationErrors.name}</span>
              )}
            </label>

            <div className="welcome-modal-field">
              <span>Ruta</span>
              <div className="welcome-modal-path-row">
                <input
                  className={`welcome-modal-input ${validationErrors.path ? "welcome-modal-input-error" : ""}`}
                  value={projectBasePath}
                  placeholder="Selecciona una carpeta base..."
                  readOnly
                />
                <button className="welcome-button welcome-button-secondary" onClick={() => void handlePickProjectPath()}>
                  Seleccionar
                </button>
              </div>
              {validationErrors.path && (
                <span className="welcome-modal-error">{validationErrors.path}</span>
              )}
            </div>

            <label className="welcome-modal-field">
              <span>Lenguaje</span>
              <select
                className="welcome-project-language"
                value={projectLanguage}
                onChange={(event) => {
                  setProjectLanguage(event.target.value as "c" | "cpp");
                  setValidationErrors((prev) => ({ ...prev, submit: undefined }));
                }}
              >
                <option value="c">C</option>
                <option value="cpp">C++</option>
              </select>
            </label>

            <div className="welcome-modal-summary">
              <p><strong>Lenguaje:</strong> {projectLanguage === "c" ? "C" : "C++"}</p>
              <p><strong>Nombre:</strong> {trimmedProjectName || "(vacío)"}</p>
              <p><strong>Ruta final:</strong> {nextProjectPath || "(sin ruta)"}</p>
            </div>
            {validationErrors.submit && (
              <p className="welcome-modal-submit-error">{validationErrors.submit}</p>
            )}

            <div className="welcome-modal-actions">
              <button
                className="welcome-button welcome-button-secondary"
                onClick={() => setIsNewProjectModalOpen(false)}
                disabled={isSubmittingProject}
              >
                Cancelar
              </button>
              <button
                className="welcome-button"
                onClick={() => void handleConfirmCreateProject()}
                disabled={!canCreateProject}
              >
                {isSubmittingProject ? "Creando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

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
