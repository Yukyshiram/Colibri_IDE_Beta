import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  watch,
  writeTextFile,
  type DirEntry,
  type UnwatchFn,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { Command, type Child } from "@tauri-apps/plugin-shell";

import "./App.css";

import TopBar from "./components/layout/TopBar";
import type { NewMenuAction } from "./components/layout/TopBar";
import ActivityBar from "./components/layout/ActivityBar";
import StatusBar from "./components/layout/StatusBar";
import ExplorerView from "./components/sidebar/ExplorerView";
import SearchView from "./components/sidebar/SearchView";
import ToolsView from "./components/sidebar/ToolsView";
import CodeEditor from "./components/editor/CodeEditor";
import WelcomeScreen from "./components/editor/WelcomeScreen";
import BottomPanel from "./components/panels/BottomPanel";
import UnsavedDialog from "./components/editor/UnsavedDialog";
import QuickOpenPalette from "./components/editor/QuickOpenPalette";
import CommandPalette, { type CommandPaletteItem } from "./components/editor/CommandPalette";
import SettingsDialog from "./components/layout/SettingsDialog";
import NewClassDialog, { type NewClassDialogSubmitPayload } from "./components/layout/NewClassDialog";
import NewProjectDialog, { type NewProjectDialogSubmitPayload } from "./components/layout/NewProjectDialog";

import type { IDEFile, FileTreeNode, RecentProject, EditorCursorPosition, IDESettings, DiagnosticItem } from "./types/ide";
import { detectLanguage } from "./lib/file-utils";
import { BUILD_DIAGNOSTIC_FILE, parseGccOutput } from "./lib/gcc-parser";
import {
  generateCppClassFiles,
  isValidCppClassName,
  isValidCppNamespace,
} from "./lib/cpp-class-templates";
import {
  generateConsoleMainContent,
  type ConsoleProjectTemplate,
} from "./lib/project-templates";
import { flattenProjectFiles, type QuickOpenFileItem } from "./lib/project-files";
import { COMMAND_PALETTE_DEFINITIONS, type CommandPaletteActionId } from "./lib/command-palette";
import { applyThemeToDocument, loadIDESettings, saveIDESettings } from "./lib/settings";

type CompileResult = {
  success: boolean;
  command: string;
  source_files: string[];
  executable_path?: string | null;
  stdout: string;
  stderr: string;
};

type RunTargetResult = {
  executable_path: string;
  working_dir: string;
  command: string;
};

type TerminalCommandResult = {
  success: boolean;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exit_code?: number | null;
};

type UnsavedDialogConfig = {
  fileNames: string[];
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
};

type NewFileOptions = {
  defaultName: string;
  templateContent: string;
};

type LastConsoleRun = {
  filePath: string;
};

type CreateProjectRequest = {
  language: "c" | "cpp";
  projectName: string;
  baseDirectory: string;
  createProjectFolder?: boolean;
  template?: ConsoleProjectTemplate;
};

type ClangFormatToolStatus = {
  status: "system-installed" | "colibri-installed" | "not-installed";
  system_path: string | null;
  managed_path: string | null;
  active_path: string | null;
};

type DiscordPresenceStatus =
  | "editing"
  | "browsing_files"
  | "compiling"
  | "build_failed"
  | "running";

type DiscordPresencePayload = {
  status: DiscordPresenceStatus;
  file_name: string | null;
  project_name: string | null;
};

const RECENT_PROJECTS_STORAGE_KEY = "colibri.recentProjects";
const LAST_PROJECT_STORAGE_KEY = "colibri.lastProjectPath";
const MAX_RECENT_PROJECTS = 10;
const WELCOME_RECENT_PREVIEW_LIMIT = 3;

const EMPTY_CLANG_FORMAT_STATUS: ClangFormatToolStatus = {
  status: "not-installed",
  system_path: null,
  managed_path: null,
  active_path: null,
};

const NON_VIEWABLE_BINARY_EXTENSIONS = new Set([
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "o",
  "obj",
  "a",
  "lib",
]);

const DISCORD_PRESENCE_THROTTLE_MS = 700;

async function buildTree(basePath: string, entries: DirEntry[], showHiddenFiles: boolean): Promise<FileTreeNode[]> {
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (!showHiddenFiles && entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = await join(basePath, entry.name);

    if (entry.isDirectory) {
      const childEntries = await readDir(fullPath);
      const children = await buildTree(fullPath, childEntries, showHiddenFiles);

      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: true,
        children,
      });
    } else {
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: false,
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export default function App() {
  const [settings, setSettings] = useState<IDESettings>(() => loadIDESettings());
  const [projectPath, setProjectPath] = useState("");
  const [projectName, setProjectName] = useState("Sin proyecto");
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [openFiles, setOpenFiles] = useState<IDEFile[]>([]);
  const [activeFileId, setActiveFileId] = useState("");
  const [selectedNode, setSelectedNode] = useState<FileTreeNode | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [missingRecentPaths, setMissingRecentPaths] = useState<Set<string>>(new Set());
  const [lastProjectPath, setLastProjectPath] = useState("");
  const [bottomMessage, setBottomMessage] = useState("[Colibrí IDE] Listo.");
  const [consoleOutput, setConsoleOutput] = useState("[Consola] Lista. Ejecuta un programa para interactuar.");
  const [isConsoleRunning, setIsConsoleRunning] = useState(false);
  const [lastConsoleRun, setLastConsoleRun] = useState<LastConsoleRun | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("[Terminal] Lista. Escribe un comando y presiona Enter.");
  const [isRunningTerminalCommand, setIsRunningTerminalCommand] = useState(false);
  const [isBottomPanelVisible, setIsBottomPanelVisible] = useState(true);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(220);
  const [isExplorerVisible, setIsExplorerVisible] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState<"output" | "terminal" | "problems" | "console">("output");
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [jumpToLine, setJumpToLine] = useState<{ line: number; col: number; ts: number } | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<"explorer" | "search" | "tools">("explorer");
  const [cursorPosition, setCursorPosition] = useState<EditorCursorPosition>({ line: 1, column: 1 });
  const [unsavedDialog, setUnsavedDialog] = useState<UnsavedDialogConfig | null>(null);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNewClassDialogOpen, setIsNewClassDialogOpen] = useState(false);
  const [newClassTargetDirectory, setNewClassTargetDirectory] = useState("");
  const [newClassError, setNewClassError] = useState("");
  const [isCreatingNewClass, setIsCreatingNewClass] = useState(false);
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [newProjectDialogLanguage, setNewProjectDialogLanguage] = useState<"c" | "cpp">("c");
  const [newProjectDialogLocation, setNewProjectDialogLocation] = useState("");
  const [newProjectDialogError, setNewProjectDialogError] = useState("");
  const [isCreatingNewProject, setIsCreatingNewProject] = useState(false);
  const [defaultProjectsDirectory, setDefaultProjectsDirectory] = useState("");
  const [clangFormatStatus, setClangFormatStatus] = useState<ClangFormatToolStatus>(
    EMPTY_CLANG_FORMAT_STATUS
  );
  const [isCheckingClangFormat, setIsCheckingClangFormat] = useState(false);
  const [isInstallingClangFormat, setIsInstallingClangFormat] = useState(false);
  const [isAutoOpening, setIsAutoOpening] = useState(false);
  const watcherCleanupRef = useRef<UnwatchFn | null>(null);
  const refreshDebounceRef = useRef<number | null>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const interactiveChildRef = useRef<Child | null>(null);
  const mainWorkspaceRef = useRef<HTMLElement | null>(null);
  const bottomResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const lastDiagnosticNavigationRef = useRef<{ file: string; line: number; col: number } | null>(null);
  const discordPresenceLastPayloadRef = useRef("");
  const discordPresenceQueuedPayloadRef = useRef<{ key: string; payload: DiscordPresencePayload } | null>(null);
  const discordPresenceDispatchingRef = useRef(false);
  const discordPresenceThrottleRef = useRef<number | null>(null);

  const activeFile = useMemo(() => {
    return openFiles.find((file) => file.id === activeFileId);
  }, [openFiles, activeFileId]);

  const flushDiscordPresenceQueue = () => {
    if (!settings.discordPresence.enabled) {
      return;
    }

    if (discordPresenceDispatchingRef.current) {
      return;
    }

    const queued = discordPresenceQueuedPayloadRef.current;
    if (!queued) {
      return;
    }

    if (discordPresenceLastPayloadRef.current === queued.key) {
      discordPresenceQueuedPayloadRef.current = null;
      return;
    }

    discordPresenceQueuedPayloadRef.current = null;
    discordPresenceDispatchingRef.current = true;

    invoke("update_discord_presence", { payload: queued.payload })
      .catch(() => {
        // Best effort: ignorar cualquier fallo de Discord RPC.
      })
      .finally(() => {
        discordPresenceDispatchingRef.current = false;
        discordPresenceLastPayloadRef.current = queued.key;

        if (!discordPresenceQueuedPayloadRef.current) {
          return;
        }

        if (discordPresenceThrottleRef.current !== null) {
          window.clearTimeout(discordPresenceThrottleRef.current);
        }

        discordPresenceThrottleRef.current = window.setTimeout(() => {
          discordPresenceThrottleRef.current = null;
          flushDiscordPresenceQueue();
        }, DISCORD_PRESENCE_THROTTLE_MS);
      });
  };

  const updateDiscordPresence = (
    status: DiscordPresenceStatus,
    fileName?: string | null
  ) => {
    if (!settings.discordPresence.enabled) {
      return;
    }

    const payload = {
      status,
      file_name: fileName ?? null,
      project_name: projectName && projectName !== "Sin proyecto" ? projectName : null,
    };

    const payloadKey = JSON.stringify(payload);
    if (discordPresenceLastPayloadRef.current === payloadKey) {
      return;
    }

    if (discordPresenceQueuedPayloadRef.current?.key === payloadKey) {
      return;
    }

    discordPresenceQueuedPayloadRef.current = {
      key: payloadKey,
      payload,
    };

    if (discordPresenceDispatchingRef.current) {
      return;
    }

    if (discordPresenceThrottleRef.current !== null) {
      return;
    }

    discordPresenceThrottleRef.current = window.setTimeout(() => {
      discordPresenceThrottleRef.current = null;
      flushDiscordPresenceQueue();
    }, DISCORD_PRESENCE_THROTTLE_MS);
  };

  useEffect(() => {
    discordPresenceLastPayloadRef.current = "";
    discordPresenceQueuedPayloadRef.current = null;

    if (discordPresenceThrottleRef.current !== null) {
      window.clearTimeout(discordPresenceThrottleRef.current);
      discordPresenceThrottleRef.current = null;
    }

    if (settings.discordPresence.enabled) {
      void invoke("start_discord_presence").catch(() => {
        // Best effort.
      });
      return;
    }

    void invoke("stop_discord_presence").catch(() => {
      // Best effort.
    });
  }, [settings.discordPresence.enabled]);

  useEffect(() => {
    return () => {
      if (discordPresenceThrottleRef.current !== null) {
        window.clearTimeout(discordPresenceThrottleRef.current);
        discordPresenceThrottleRef.current = null;
      }

      discordPresenceQueuedPayloadRef.current = null;

      void invoke("stop_discord_presence").catch(() => {
        // Best effort.
      });
    };
  }, []);

  const hasProjectOpen = Boolean(projectPath);
  const hasActiveEditorFile = openFiles.length > 0;
  const quickOpenFiles = useMemo(
    () => flattenProjectFiles(tree, projectPath),
    [tree, projectPath]
  );
  const commandPaletteItems = useMemo<CommandPaletteItem[]>(() => {
    const isFileContextAvailable = Boolean(projectPath);
    const hasActiveFile = Boolean(activeFile);
    const hasFormattableFile = Boolean(
      activeFile && (activeFile.language === "c" || activeFile.language === "cpp")
    );

    return COMMAND_PALETTE_DEFINITIONS.map((definition) => {
      let disabled = false;

      if (definition.id === "new-file" || definition.id === "new-folder") {
        disabled = !isFileContextAvailable;
      }

      if (definition.id === "build" || definition.id === "run" || definition.id === "close-active-tab") {
        disabled = !hasActiveFile;
      }

      if (definition.id === "format-document") {
        disabled = !hasFormattableFile;
      }

      return {
        ...definition,
        disabled,
      };
    });
  }, [projectPath, activeFile]);

  const getProjectNameFromPath = (pathValue: string) => {
    return pathValue.split(/[\\/]/).pop() || "Proyecto";
  };

  const loadRecentProjects = (): RecentProject[] => {
    try {
      const raw = window.localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (item): item is RecentProject =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as RecentProject).name === "string" &&
            typeof (item as RecentProject).path === "string" &&
            typeof (item as RecentProject).lastOpenedAt === "number"
        )
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
        .slice(0, MAX_RECENT_PROJECTS);
    } catch {
      return [];
    }
  };

  const saveRecentProjects = (projects: RecentProject[]) => {
    window.localStorage.setItem(
      RECENT_PROJECTS_STORAGE_KEY,
      JSON.stringify(projects.slice(0, MAX_RECENT_PROJECTS))
    );
  };

  const upsertRecentProject = (nextPath: string) => {
    const now = Date.now();
    const nextItem: RecentProject = {
      name: getProjectNameFromPath(nextPath),
      path: nextPath,
      lastOpenedAt: now,
    };

    setRecentProjects((prev) => {
      const withoutDuplicate = prev.filter((item) => item.path !== nextPath);
      const nextRecent = [nextItem, ...withoutDuplicate].slice(0, MAX_RECENT_PROJECTS);
      saveRecentProjects(nextRecent);
      return nextRecent;
    });

    setMissingRecentPaths((prev) => {
      if (!prev.has(nextPath)) return prev;
      const next = new Set(prev);
      next.delete(nextPath);
      return next;
    });

    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, nextPath);
    setLastProjectPath(nextPath);
  };

  const resolveTargetDirectory = (contextNode?: FileTreeNode) => {
    const sourceNode = contextNode ?? selectedNode;

    if (!sourceNode) {
      return projectPath;
    }

    if (sourceNode.isDirectory) {
      return sourceNode.path;
    }

    return sourceNode.path.replace(/[\\/][^\\/]+$/, "");
  };

  const openProjectFolder = async (targetPath: string) => {
    // Guard: confirm before discarding any dirty files
    const dirtyFiles = openFiles.filter((f) => f.isDirty);
    if (dirtyFiles.length > 0) {
      try {
        await new Promise<void>((resolve, reject) => {
          setUnsavedDialog({
            fileNames: dirtyFiles.map((f) => f.name),
            onSave: async () => {
              setUnsavedDialog(null);
              for (const file of dirtyFiles) {
                const saved = await saveFileDirectly(file);
                if (!saved) {
                  reject(new Error("save-failed"));
                  return;
                }
              }
              resolve();
            },
            onDiscard: () => {
              setUnsavedDialog(null);
              resolve();
            },
            onCancel: () => {
              setUnsavedDialog(null);
              reject(new Error("cancelled"));
            },
          });
        });
      } catch {
        return; // user cancelled — abort opening
      }
    }

    const rootEntries = await readDir(targetPath);
    const mappedTree = await buildTree(targetPath, rootEntries, settings.showHiddenFiles);
    const projectFolderName = getProjectNameFromPath(targetPath);

    if (interactiveChildRef.current) {
      try {
        await interactiveChildRef.current.kill();
      } catch {
        // Ignore kill errors during project switch; process may have already exited.
      } finally {
        interactiveChildRef.current = null;
      }
    }

    setProjectPath(targetPath);
    setProjectName(projectFolderName);
    setTree(mappedTree);
    setSelectedNode(null);
    setOpenFiles([]);
    setActiveFileId("");
    setDiagnostics([]);
    setJumpToLine(null);
    setConsoleOutput("[Consola] Lista. Ejecuta un programa para interactuar.");
    setIsConsoleRunning(false);
    interactiveChildRef.current = null;
    setLastConsoleRun(null);
    upsertRecentProject(targetPath);
    setBottomMessage(`[Colibrí IDE] Proyecto abierto: ${targetPath}`);
  };

  useEffect(() => {
    const initializeRecentProjects = async () => {
      const loadedRecent = loadRecentProjects();
      const existenceChecks = await Promise.all(
        loadedRecent.map(async (project) => {
          try {
            return {
              project,
              exists: await exists(project.path),
            };
          } catch {
            return {
              project,
              exists: false,
            };
          }
        })
      );

      const missing = existenceChecks
        .filter((entry) => !entry.exists)
        .map((entry) => entry.project.path);

      setRecentProjects(loadedRecent.slice(0, MAX_RECENT_PROJECTS));
      setMissingRecentPaths(new Set(missing));
      saveRecentProjects(loadedRecent);

      const rememberedLastProjectPath = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY) ?? "";
      const validLastPath = existenceChecks.some((entry) => entry.project.path === rememberedLastProjectPath && entry.exists)
        ? rememberedLastProjectPath
        : "";

      if (validLastPath) {
        setLastProjectPath(validLastPath);
      } else {
        setLastProjectPath("");
        window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
      }

      if (!settings.showWelcomeOnStart && validLastPath) {
        setIsAutoOpening(true);
        try {
          await openProjectFolder(validLastPath);
        } finally {
          setIsAutoOpening(false);
        }
      }
    };

    void initializeRecentProjects();
  }, []);

  useEffect(() => {
    const loadDefaultProjectsDirectory = async () => {
      try {
        const path = await invoke<string>("resolve_default_projects_directory");
        setDefaultProjectsDirectory(path);
        setNewProjectDialogLocation((prev) => prev || path);
      } catch (error) {
        console.error(error);
      }
    };

    void loadDefaultProjectsDirectory();
  }, []);

  const refreshClangFormatStatus = async () => {
    setIsCheckingClangFormat(true);
    try {
      const status = await invoke<ClangFormatToolStatus>("get_clang_format_status");
      setClangFormatStatus(status);
    } catch (error) {
      console.error(error);
      setClangFormatStatus(EMPTY_CLANG_FORMAT_STATUS);
      setBottomMessage(
        `[Tools] No se pudo detectar clang-format: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsCheckingClangFormat(false);
    }
  };

  useEffect(() => {
    void refreshClangFormatStatus();
  }, []);

  useEffect(() => {
    if (!isExplorerVisible || activeSidebar !== "tools") return;
    void refreshClangFormatStatus();
  }, [isExplorerVisible, activeSidebar]);

  useEffect(() => {
    saveIDESettings(settings);
    applyThemeToDocument(settings.theme);
  }, [settings]);

  useEffect(() => {
    setCursorPosition({ line: 1, column: 1 });
  }, [activeFileId]);

  useEffect(() => {
    if (!projectPath) return;
    void refreshExplorer(projectPath);
  }, [settings.showHiddenFiles]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (openFiles.some((f) => f.isDirty)) {
        e.preventDefault();
        // Standard way to trigger the browser/Tauri "unsaved changes" warning
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [openFiles]);

  const refreshExplorer = async (basePath?: string) => {
    const targetPath = basePath || projectPath;

    if (!targetPath) {
      return;
    }

    const rootEntries = await readDir(targetPath);
    const mappedTree = await buildTree(targetPath, rootEntries, settings.showHiddenFiles);
    setTree(mappedTree);
  };

  const normalizePath = (pathValue: string) => pathValue.replace(/[\\/]+/g, "/").toLowerCase();

  const navigateToDiagnosticLocation = (targetFile: IDEFile, line: number, col: number) => {
    const normalizedTargetPath = normalizePath(targetFile.path);
    const normalizedActivePath = activeFile ? normalizePath(activeFile.path) : "";
    const isSameFile = normalizedTargetPath === normalizedActivePath;
    const isSamePosition =
      isSameFile &&
      cursorPosition.line === line &&
      cursorPosition.column === col;

    // Keep active tab sync even if no jump event is emitted.
    setActiveFileId(targetFile.id);

    if (isSamePosition) {
      lastDiagnosticNavigationRef.current = {
        file: targetFile.path,
        line,
        col,
      };
      return;
    }

    const previous = lastDiagnosticNavigationRef.current;
    const isRepeatedTarget =
      previous !== null &&
      normalizePath(previous.file) === normalizedTargetPath &&
      previous.line === line &&
      previous.col === col &&
      isSameFile;

    if (isRepeatedTarget) {
      return;
    }

    const ts = Date.now();
    lastDiagnosticNavigationRef.current = {
      file: targetFile.path,
      line,
      col,
    };
    setJumpToLine({ line, col, ts });
  };

  const isSameOrChildPath = (candidatePath: string, targetPath: string) => {
    const candidate = normalizePath(candidatePath);
    const target = normalizePath(targetPath);

    return candidate === target || candidate.startsWith(`${target}/`);
  };

  useEffect(() => {
    let isCancelled = false;

    if (!projectPath) {
      if (watcherCleanupRef.current) {
        watcherCleanupRef.current();
        watcherCleanupRef.current = null;
      }

      if (refreshDebounceRef.current !== null) {
        window.clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }

      return;
    }

    const scheduleExplorerRefresh = () => {
      if (refreshDebounceRef.current !== null) {
        window.clearTimeout(refreshDebounceRef.current);
      }

      refreshDebounceRef.current = window.setTimeout(() => {
        void refreshExplorer(projectPath);
      }, 250);
    };

    const startWatcher = async () => {
      try {
        const unwatch = await watch(
          projectPath,
          () => {
            scheduleExplorerRefresh();
          },
          {
            recursive: true,
            delayMs: 120,
          }
        );

        if (isCancelled) {
          unwatch();
          return;
        }

        if (watcherCleanupRef.current) {
          watcherCleanupRef.current();
        }

        watcherCleanupRef.current = unwatch;
      } catch (error) {
        console.error(error);
        setBottomMessage(
          `[Error] No se pudo iniciar el file watcher: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    };

    void startWatcher();

    return () => {
      isCancelled = true;

      if (watcherCleanupRef.current) {
        watcherCleanupRef.current();
        watcherCleanupRef.current = null;
      }

      if (refreshDebounceRef.current !== null) {
        window.clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
    };
  }, [projectPath]);

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Selecciona una carpeta de proyecto",
      });

      if (!selected || Array.isArray(selected)) return;

      await openProjectFolder(selected);
    } catch (error) {
      console.error(error);
      setBottomMessage("[Error] No se pudo abrir la carpeta.");
    }
  };

  const handleOpenRecentProject = async (targetPath: string) => {
    try {
      const pathExists = await exists(targetPath);
      if (!pathExists) {
        setMissingRecentPaths((prev) => new Set(prev).add(targetPath));
        setBottomMessage("[Colibrí IDE] Ese proyecto ya no existe en disco.");
        return;
      }

      setMissingRecentPaths((prev) => {
        if (!prev.has(targetPath)) return prev;
        const next = new Set(prev);
        next.delete(targetPath);
        return next;
      });

      await openProjectFolder(targetPath);
    } catch (error) {
      console.error(error);
      setMissingRecentPaths((prev) => new Set(prev).add(targetPath));
      setBottomMessage("[Colibrí IDE] No se pudo abrir ese proyecto reciente.");
    }
  };

  const handleRemoveRecentProject = (targetPath: string) => {
    setRecentProjects((prev) => {
      const next = prev.filter((p) => p.path !== targetPath);
      saveRecentProjects(next);
      return next;
    });

    setMissingRecentPaths((prev) => {
      if (!prev.has(targetPath)) return prev;
      const next = new Set(prev);
      next.delete(targetPath);
      return next;
    });

    if (lastProjectPath === targetPath) {
      setLastProjectPath("");
      window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY);
    }
  };

  const handleRefreshExplorer = async () => {
    if (!projectPath) {
      setBottomMessage("[Error] No hay proyecto abierto para refrescar.");
      return;
    }

    try {
      await refreshExplorer();
      setBottomMessage(`[Colibrí IDE] Explorador actualizado: ${projectPath}`);
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] No se pudo refrescar el explorador: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const handleOpenFile = async (node: FileTreeNode) => {
    if (node.isDirectory) return;

    const extension = node.name.split(".").pop()?.toLowerCase() ?? "";
    if (NON_VIEWABLE_BINARY_EXTENSIONS.has(extension)) {
      setSelectedNode(node);
      setBottomMessage(
        `[Colibrí IDE] No es posible visualizar archivos binarios en el editor: ${node.name}`
      );
      return;
    }

    setSelectedNode(node);

    const alreadyOpen = openFiles.find((file) => file.path === node.path);
    if (alreadyOpen) {
      setActiveFileId(alreadyOpen.id);
      return;
    }

    try {
      const content = await readTextFile(node.path);

      const newFile: IDEFile = {
        id: crypto.randomUUID(),
        name: node.name,
        path: node.path,
        language: detectLanguage(node.name),
        content,
        savedContent: content,
        isDirty: false,
      };

      setOpenFiles((prev) => [...prev, newFile]);
      setActiveFileId(newFile.id);
      setBottomMessage(`[Colibrí IDE] Archivo abierto: ${node.path}`);
    } catch (error) {
      console.error(error);
      setBottomMessage("[Error] No se pudo abrir el archivo.");
    }
  };

  const handleQuickOpenItem = (item: QuickOpenFileItem) => {
    setIsQuickOpenOpen(false);
    void handleOpenFile(item.node);
  };

  const handleNewFile = async (contextNode?: FileTreeNode, options?: NewFileOptions) => {
    if (!projectPath) {
      setBottomMessage("[Error] Abre una carpeta antes de crear un archivo nuevo.");
      return;
    }

    try {
      const requestedName = window.prompt(
        "Nombre del archivo nuevo",
        options?.defaultName ?? "main.c"
      );
      const fileName = requestedName?.trim();

      if (!fileName) return;

      const targetDirectory = resolveTargetDirectory(contextNode);
      const filePath = await join(targetDirectory, fileName);

      const fileAlreadyExists = await exists(filePath);
      if (fileAlreadyExists) {
        setBottomMessage(`[Error] Ya existe un archivo con ese nombre: ${fileName}`);
        return;
      }

      const initialContent = options?.templateContent ?? "";
      await writeTextFile(filePath, initialContent);

      const newFile: IDEFile = {
        id: crypto.randomUUID(),
        name: fileName,
        path: filePath,
        language: detectLanguage(fileName),
        content: initialContent,
        savedContent: initialContent,
        isDirty: false,
      };

      setOpenFiles((prev) => [...prev, newFile]);
      setActiveFileId(newFile.id);
      setSelectedNode({
        name: fileName,
        path: filePath,
        isDirectory: false,
      });
      await refreshExplorer(projectPath);
      setBottomMessage(`[Colibrí IDE] Nuevo archivo creado: ${filePath}`);
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] No se pudo crear el archivo nuevo: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const createProjectFromRequest = async ({
    language,
    projectName,
    baseDirectory,
    createProjectFolder,
    template,
  }: CreateProjectRequest): Promise<boolean> => {
    const projectNameValue = projectName.trim();
    const baseDirectoryValue = baseDirectory.trim();
    const shouldCreateFolder = createProjectFolder ?? true;
    const selectedTemplate = template ?? "hello-world";

    if (!projectNameValue) {
      setBottomMessage("[Error] El nombre del proyecto no puede estar vacío.");
      return false;
    }

    if (!baseDirectoryValue) {
      setBottomMessage("[Error] Selecciona la ubicación del proyecto.");
      return false;
    }

    const baseDirectoryExists = await exists(baseDirectoryValue);
    if (!baseDirectoryExists) {
      setBottomMessage(`[Error] La ubicación no existe: ${baseDirectoryValue}`);
      return false;
    }

    const projectPathValue = shouldCreateFolder
      ? await join(baseDirectoryValue, projectNameValue)
      : baseDirectoryValue;

    if (shouldCreateFolder) {
      const projectExists = await exists(projectPathValue);
      if (projectExists) {
        setBottomMessage(`[Error] Ya existe un proyecto con ese nombre: ${projectNameValue}`);
        return false;
      }
      await mkdir(projectPathValue);
    }

    const isCppProject = language === "cpp";
    const mainFileName = isCppProject ? "main.cpp" : "main.c";
    const mainContent = generateConsoleMainContent({
      language,
      template: selectedTemplate,
    });

    const mainFilePath = await join(projectPathValue, mainFileName);

    const mainFileAlreadyExists = await exists(mainFilePath);
    if (mainFileAlreadyExists) {
      setBottomMessage(`[Error] Ya existe ${mainFileName} en la ubicación seleccionada.`);
      return false;
    }

    await writeTextFile(mainFilePath, mainContent);

    await openProjectFolder(projectPathValue);
    await handleOpenFile({
      name: mainFileName,
      path: mainFilePath,
      isDirectory: false,
    });

    setBottomMessage(`[Colibrí IDE] Proyecto creado: ${projectPathValue}`);
    return true;
  };

  const handleCreateProjectFromNewMenu = async (language: "c" | "cpp") => {
    setNewProjectDialogLanguage(language);
    setNewProjectDialogLocation(defaultProjectsDirectory || projectPath || "");
    setNewProjectDialogError("");
    setIsNewProjectDialogOpen(true);
  };

  const handleOpenNewProjectFromWelcome = () => {
    setNewProjectDialogLanguage("c");
    setNewProjectDialogLocation(defaultProjectsDirectory || "");
    setNewProjectDialogError("");
    setIsNewProjectDialogOpen(true);
  };

  const handlePickNewProjectLocation = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Selecciona dónde crear el proyecto",
      defaultPath: newProjectDialogLocation || defaultProjectsDirectory || projectPath || undefined,
    });

    if (!selected || Array.isArray(selected)) return;
    setNewProjectDialogLocation(selected);
    setNewProjectDialogError("");
  };

  const handleUseExistingClangFormat = async () => {
    setIsInstallingClangFormat(true);

    try {
      const picked = await open({
        multiple: false,
        directory: false,
        title: "Selecciona un ejecutable clang-format existente",
        filters: [
          {
            name: "clang-format",
            extensions: ["exe"],
          },
        ],
      });

      if (!picked || Array.isArray(picked)) {
        setBottomMessage("[Tools] Selección cancelada. No se cambió la configuración.");
        return;
      }

      const installed = await invoke<ClangFormatToolStatus>("install_clang_format_managed", {
        sourcePath: picked,
      });

      setClangFormatStatus(installed);
      setBottomMessage("[Tools] clang-format configurado desde una instalación existente.");
    } catch (error) {
      setBottomMessage(
        `[Tools] No se pudo usar esa instalación de clang-format: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsInstallingClangFormat(false);
      void refreshClangFormatStatus();
    }
  };

  const handleSubmitNewProjectDialog = async (payload: NewProjectDialogSubmitPayload) => {
    if (!payload.location.trim()) {
      setNewProjectDialogError("Selecciona una ubicación para el proyecto.");
      return;
    }

    if (!payload.projectName.trim()) {
      setNewProjectDialogError("El nombre del proyecto es obligatorio.");
      return;
    }

    setIsCreatingNewProject(true);
    setNewProjectDialogError("");

    try {
      const created = await createProjectFromRequest({
        language: payload.language,
        projectName: payload.projectName,
        baseDirectory: payload.location,
        createProjectFolder: payload.createProjectFolder,
        template: payload.template,
      });

      if (!created) {
        setNewProjectDialogError("No se pudo crear el proyecto. Revisa nombre y ubicación.");
        return;
      }

      setIsNewProjectDialogOpen(false);
    } catch (error) {
      console.error(error);
      setNewProjectDialogError(
        `No se pudo crear el proyecto: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsCreatingNewProject(false);
    }
  };

  const handleCreateFromNewMenu = async (action: NewMenuAction) => {
    switch (action) {
      case "empty-file":
        await handleNewFile(undefined, {
          defaultName: "untitled.txt",
          templateContent: "",
        });
        break;
      case "c-file":
        await handleNewFile(undefined, {
          defaultName: "main.c",
          templateContent: [
            "#include <stdio.h>",
            "",
            "int main() {",
            "  printf(\"Hello from Colibri IDE!\\n\");",
            "  return 0;",
            "}",
            "",
          ].join("\n"),
        });
        break;
      case "cpp-file":
        await handleNewFile(undefined, {
          defaultName: "main.cpp",
          templateContent: [
            "#include <iostream>",
            "",
            "int main() {",
            "  std::cout << \"Hello from Colibri IDE!\\n\";",
            "  return 0;",
            "}",
            "",
          ].join("\n"),
        });
        break;
      case "cpp-class": {
        if (!projectPath) {
          setBottomMessage("[Error] Abre una carpeta antes de crear una clase C++.");
          return;
        }

        setNewClassTargetDirectory(resolveTargetDirectory());
        setNewClassError("");
        setIsNewClassDialogOpen(true);
        break;
      }
      case "header-file":
        await handleNewFile(undefined, {
          defaultName: "new_header.h",
          templateContent: [
            "#ifndef NEW_HEADER_H",
            "#define NEW_HEADER_H",
            "",
            "",
            "#endif /* NEW_HEADER_H */",
            "",
          ].join("\n"),
        });
        break;
      case "c-project":
        await handleCreateProjectFromNewMenu("c");
        break;
      case "cpp-project":
        await handleCreateProjectFromNewMenu("cpp");
        break;
      default:
        break;
    }
  };

  const handlePickNewClassDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Selecciona carpeta destino para la clase C++",
      defaultPath: newClassTargetDirectory || projectPath || undefined,
    });

    if (!selected || Array.isArray(selected)) return;
    setNewClassTargetDirectory(selected);
    setNewClassError("");
  };

  const handleCreateNewCppClass = async (payload: NewClassDialogSubmitPayload) => {
    const className = payload.className.trim();
    const namespaceName = payload.namespaceName.trim();
    const targetDirectory = payload.targetDirectory.trim();

    if (!projectPath) {
      setNewClassError("Abre un proyecto antes de crear clases C++.");
      return;
    }

    if (!targetDirectory) {
      setNewClassError("Selecciona una carpeta destino.");
      return;
    }

    if (!payload.generateHeader && !payload.generateSource) {
      setNewClassError("Debes generar al menos un archivo (.h o .cpp).");
      return;
    }

    if (!isValidCppClassName(className)) {
      setNewClassError("Nombre de clase invalido. Usa formato C++ (ej: MyClass).");
      return;
    }

    if (!isValidCppNamespace(namespaceName)) {
      setNewClassError("Namespace invalido. Usa formato como app::core.");
      return;
    }

    const generation = generateCppClassFiles({
      className,
      namespaceName,
      baseClass: payload.baseClass.trim(),
      generateHeader: payload.generateHeader,
      generateSource: payload.generateSource,
      headerStyle: payload.headerStyle,
      generateConstructor: payload.generateConstructor,
      generateDestructor: payload.generateDestructor,
    });

    const filesToCreate: Array<{ path: string; name: string; content: string }> = [];

    if (payload.generateHeader) {
      filesToCreate.push({
        path: await join(targetDirectory, generation.headerFileName),
        name: generation.headerFileName,
        content: generation.headerContent,
      });
    }

    if (payload.generateSource) {
      filesToCreate.push({
        path: await join(targetDirectory, generation.sourceFileName),
        name: generation.sourceFileName,
        content: generation.sourceContent,
      });
    }

    for (const file of filesToCreate) {
      const alreadyExists = await exists(file.path);
      if (alreadyExists) {
        setNewClassError(`Ya existe el archivo: ${file.name}`);
        return;
      }
    }

    setIsCreatingNewClass(true);
    setNewClassError("");

    try {
      for (const file of filesToCreate) {
        await writeTextFile(file.path, file.content);
      }

      await refreshExplorer(projectPath);

      for (const file of filesToCreate) {
        await handleOpenFile({
          name: file.name,
          path: file.path,
          isDirectory: false,
        });
      }

      setIsNewClassDialogOpen(false);
      setBottomMessage(
        `[Colibrí IDE] Clase C++ creada: ${className} (${filesToCreate
          .map((f) => f.name)
          .join(", ")})`
      );
    } catch (error) {
      console.error(error);
      setNewClassError(
        `No se pudo crear la clase: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsCreatingNewClass(false);
    }
  };

  const handleNewFolder = async (contextNode?: FileTreeNode) => {
    if (!projectPath) {
      setBottomMessage("[Error] Abre una carpeta antes de crear una carpeta nueva.");
      return;
    }

    try {
      const requestedName = window.prompt("Nombre de la carpeta nueva", "nueva-carpeta");
      const folderName = requestedName?.trim();

      if (!folderName) return;

      const targetDirectory = resolveTargetDirectory(contextNode);
      const folderPath = await join(targetDirectory, folderName);

      const folderAlreadyExists = await exists(folderPath);
      if (folderAlreadyExists) {
        setBottomMessage(`[Error] Ya existe una carpeta con ese nombre: ${folderName}`);
        return;
      }

      await mkdir(folderPath);
      setSelectedNode({
        name: folderName,
        path: folderPath,
        isDirectory: true,
        children: [],
      });
      await refreshExplorer(projectPath);
      setBottomMessage(`[Colibrí IDE] Nueva carpeta creada: ${folderPath}`);
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] No se pudo crear la carpeta: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const handleRenameNode = async (node: FileTreeNode) => {
    if (!projectPath) {
      setBottomMessage("[Error] No hay proyecto abierto.");
      return;
    }

    try {
      const requestedName = window.prompt("Nuevo nombre", node.name);
      const nextName = requestedName?.trim();

      if (!nextName || nextName === node.name) return;

      const parentPath = node.path.replace(/[\\/][^\\/]+$/, "");
      const nextPath = await join(parentPath, nextName);

      const targetExists = await exists(nextPath);
      if (targetExists) {
        setBottomMessage(`[Error] Ya existe un elemento con el nombre: ${nextName}`);
        return;
      }

      await rename(node.path, nextPath);

      setSelectedNode((prev) => {
        if (!prev) return prev;

        const shouldUpdate = node.isDirectory
          ? isSameOrChildPath(prev.path, node.path)
          : prev.path === node.path;

        if (!shouldUpdate) return prev;

        const nextSelectedPath = node.isDirectory
          ? `${nextPath}${prev.path.slice(node.path.length)}`
          : nextPath;

        return {
          ...prev,
          name: prev.path === node.path ? nextName : prev.name,
          path: nextSelectedPath,
        };
      });

      setOpenFiles((prev) =>
        prev.map((file) => {
          const shouldUpdate = node.isDirectory
            ? isSameOrChildPath(file.path, node.path)
            : file.path === node.path;

          if (!shouldUpdate) return file;

          const nextFilePath = node.isDirectory
            ? `${nextPath}${file.path.slice(node.path.length)}`
            : nextPath;

          const nextFileName = file.path === node.path
            ? nextName
            : file.name;

          return {
            ...file,
            path: nextFilePath,
            name: nextFileName,
            language: file.path === node.path
              ? detectLanguage(nextFileName)
              : file.language,
          };
        })
      );

      await refreshExplorer(projectPath);
      setBottomMessage(`[Colibrí IDE] Renombrado: ${node.name} -> ${nextName}`);
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] No se pudo renombrar: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const handleDeleteNode = async (node: FileTreeNode) => {
    if (!projectPath) {
      setBottomMessage("[Error] No hay proyecto abierto.");
      return;
    }

    const confirmed = window.confirm(
      `¿Eliminar ${node.isDirectory ? "la carpeta" : "el archivo"} \"${node.name}\"?`
    );

    if (!confirmed) return;

    try {
      await remove(node.path, { recursive: node.isDirectory });

      setSelectedNode((prev) => {
        if (!prev) return prev;

        const removedSelection = node.isDirectory
          ? isSameOrChildPath(prev.path, node.path)
          : prev.path === node.path;

        return removedSelection ? null : prev;
      });

      setOpenFiles((prev) => {
        const remaining = prev.filter((file) => {
          if (node.isDirectory) {
            return !isSameOrChildPath(file.path, node.path);
          }

          return file.path !== node.path;
        });

        setActiveFileId((current) =>
          remaining.some((file) => file.id === current)
            ? current
            : (remaining[remaining.length - 1]?.id ?? "")
        );

        return remaining;
      });

      await refreshExplorer(projectPath);
      setBottomMessage(`[Colibrí IDE] Eliminado: ${node.path}`);
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] No se pudo eliminar: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const handleMoveNode = async (srcPath: string, destFolderPath: string) => {
    if (!projectPath) return;

    // No mover al mismo directorio donde ya está
    const srcParent = srcPath.replace(/[\\/][^\\/]+$/, "");
    if (normalizePath(srcParent) === normalizePath(destFolderPath)) return;

    // No mover una carpeta dentro de sí misma ni de sus descendientes
    if (isSameOrChildPath(destFolderPath, srcPath)) {
      setBottomMessage("[Error] No se puede mover una carpeta dentro de sí misma.");
      return;
    }

    try {
      const srcName = srcPath.split(/[\\/]/).pop()!;
      const destPath = await join(destFolderPath, srcName);

      const alreadyExists = await exists(destPath);
      if (alreadyExists) {
        setBottomMessage(`[Error] Ya existe "${srcName}" en la carpeta destino.`);
        return;
      }

      await rename(srcPath, destPath);

      setSelectedNode((prev) => {
        if (!prev) return prev;
        if (!isSameOrChildPath(prev.path, srcPath)) return prev;
        return {
          ...prev,
          path: destPath + prev.path.slice(srcPath.length),
          name: prev.path === srcPath ? srcName : prev.name,
        };
      });

      setOpenFiles((prev) =>
        prev.map((file) => {
          if (!isSameOrChildPath(file.path, srcPath)) return file;
          const newFilePath = destPath + file.path.slice(srcPath.length);
          const newFileName = file.path === srcPath ? srcName : file.name;
          return {
            ...file,
            path: newFilePath,
            name: newFileName,
            language: file.path === srcPath ? detectLanguage(newFileName) : file.language,
          };
        })
      );

      await refreshExplorer(projectPath);
      setBottomMessage(`[Colibrí IDE] Movido: ${srcName}`);
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] No se pudo mover: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const handleSelectTab = (fileId: string) => {
    setActiveFileId(fileId);
  };

  const handleCloseTab = (fileId: string) => {
    const fileToClose = openFiles.find((f) => f.id === fileId);

    const performClose = () => {
      setOpenFiles((prev) => {
        const closeIdx = prev.findIndex((f) => f.id === fileId);
        if (closeIdx === -1) return prev;

        const updated = prev.filter((file) => file.id !== fileId);

        setActiveFileId((current) => {
          if (current !== fileId) return current;
          const nextFile = updated[closeIdx] ?? updated[closeIdx - 1];
          return nextFile?.id ?? "";
        });

        return updated;
      });
    };

    if (fileToClose?.isDirty) {
      setUnsavedDialog({
        fileNames: [fileToClose.name],
        onSave: async () => {
          setUnsavedDialog(null);
          await saveFileDirectly(fileToClose);
          performClose();
        },
        onDiscard: () => {
          setUnsavedDialog(null);
          performClose();
        },
        onCancel: () => {
          setUnsavedDialog(null);
        },
      });
    } else {
      performClose();
    }
  };

  const handleChangeContent = (value: string) => {
    setOpenFiles((prev) =>
      prev.map((file) => {
        if (file.id !== activeFileId) return file;

        return {
          ...file,
          content: value,
          isDirty: value !== file.savedContent,
        };
      })
    );
  };

  const saveFileDirectly = async (file: IDEFile): Promise<boolean> => {
    try {
      await writeTextFile(file.path, file.content);
      setOpenFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, savedContent: f.content, isDirty: false } : f
        )
      );
      setBottomMessage(`[Colibrí IDE] Archivo guardado: ${file.path}`);
      return true;
    } catch (error) {
      console.error("Error al guardar archivo:", error);
      setBottomMessage(
        `[Error] No se pudo guardar: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  };

  const handleSaveFile = async () => {
    if (!activeFile) return false;
    return saveFileDirectly(activeFile);
  };

  const appendTerminalOutput = (nextBlock: string) => {
    setTerminalOutput((prev) => `${prev}\n\n${nextBlock}`.trim());
  };

  const appendConsoleOutput = (nextBlock: string) => {
    setConsoleOutput((prev) => `${prev}\n${nextBlock}`.trim());
  };

  const stopInteractiveProcess = async () => {
    if (!interactiveChildRef.current) return;

    try {
      await interactiveChildRef.current.kill();
      appendConsoleOutput("[Consola] Proceso detenido por el usuario.");
    } catch (error) {
      appendConsoleOutput(
        `[Consola][error] ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      interactiveChildRef.current = null;
      setIsConsoleRunning(false);
    }
  };

  const startInteractiveRun = async (filePath: string) => {
    const target = await invoke<RunTargetResult>("resolve_run_target", { filePath });

    if (interactiveChildRef.current) {
      await stopInteractiveProcess();
    }

    setConsoleOutput(
      [
        "[Consola] Ejecución iniciada.",
        `[Comando] ${target.command}`,
        `[Directorio] ${target.working_dir}`,
      ].join("\n")
    );

    setIsBottomPanelVisible(true);
    setActiveBottomTab("console");

    const isWindows = window.navigator.userAgent.toLowerCase().includes("windows");
    const command = isWindows
      ? Command.create("run-binary-win", ["/C", target.executable_path], {
          cwd: target.working_dir,
        })
      : Command.create("run-binary-unix", ["-lc", `"${target.executable_path.replace(/"/g, "\\\"")}"`], {
          cwd: target.working_dir,
        });

    command.stdout.on("data", (line) => {
      appendConsoleOutput(String(line));
    });

    command.stderr.on("data", (line) => {
      appendConsoleOutput(`[stderr] ${String(line)}`);
    });

    command.on("error", (error) => {
      appendConsoleOutput(`[Consola][error] ${error}`);
      interactiveChildRef.current = null;
      setIsConsoleRunning(false);
    });

    command.on("close", ({ code, signal }) => {
      appendConsoleOutput(
        `[Consola] Proceso finalizado (exit=${code ?? "null"}, signal=${signal ?? "null"}).`
      );
      interactiveChildRef.current = null;
      setIsConsoleRunning(false);
    });

    const child = await command.spawn();
    interactiveChildRef.current = child;
    setIsConsoleRunning(true);
    setLastConsoleRun({ filePath });

    const fileName = filePath.split(/[\\/]/).pop() ?? null;
    void updateDiscordPresence("running", fileName);
  };

  const handleSendConsoleInput = async (input: string) => {
    if (!interactiveChildRef.current || !isConsoleRunning) {
      appendConsoleOutput("[Consola] No hay proceso activo para recibir input.");
      return;
    }

    try {
      await interactiveChildRef.current.write(`${input}\n`);
      appendConsoleOutput(`> ${input}`);
    } catch (error) {
      appendConsoleOutput(
        `[Consola][error] ${error instanceof Error ? error.message : String(error)}`
      );
      interactiveChildRef.current = null;
      setIsConsoleRunning(false);
    }
  };

  const handleClearConsoleOutput = () => {
    setConsoleOutput("[Consola] Limpia.");
  };

  const handleRerunConsole = async () => {
    if (!lastConsoleRun) {
      appendConsoleOutput("[Consola] No hay ejecución previa para repetir.");
      return;
    }

    try {
      await startInteractiveRun(lastConsoleRun.filePath);
    } catch (error) {
      appendConsoleOutput(
        `[Consola][error] ${error instanceof Error ? error.message : String(error)}`
      );
      setIsConsoleRunning(false);
    }
  };

  const handleRunTerminalCommand = async (commandText: string) => {
    const command = commandText.trim();
    if (!command || !projectPath) {
      return;
    }

    setIsBottomPanelVisible(true);
    setActiveBottomTab("terminal");
    setIsRunningTerminalCommand(true);

    appendTerminalOutput(`$ ${command}`);

    try {
      const result = await invoke<TerminalCommandResult>("run_terminal_command", {
        command,
        workingDir: projectPath,
      });

      appendTerminalOutput(
        [
          `[cwd] ${result.cwd}`,
          result.stdout ? `[stdout]\n${result.stdout}` : "",
          result.stderr ? `[stderr]\n${result.stderr}` : "",
          result.exit_code !== undefined && result.exit_code !== null
            ? `[exit code] ${result.exit_code}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      );
    } catch (error) {
      appendTerminalOutput(
        `[error] ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsRunningTerminalCommand(false);
    }
  };

  const handleClearTerminalOutput = () => {
    setTerminalOutput("[Terminal] Limpia.");
  };

  const openToolsForFormatSetup = () => {
    setIsExplorerVisible(true);
    setActiveSidebar("tools");
  };

  const handleMissingClangFormatForFormatting = async () => {
    setBottomMessage(
      "[Format] clang-format no está disponible. Configura una instalación existente desde Tools."
    );

    const configureNow = window.confirm(
      "clang-format no está configurado. ¿Deseas seleccionar un ejecutable existente ahora?"
    );

    if (configureNow) {
      await handleUseExistingClangFormat();
      return;
    }

    const openTools = window.confirm("¿Deseas abrir la vista Tools para configurarlo después?");
    if (openTools) {
      openToolsForFormatSetup();
    }
  };

  const handleFormatDocument = async () => {
    if (!activeFile) {
      setBottomMessage("[Error] No hay archivo activo para formatear.");
      return;
    }

    if (activeFile.language !== "c" && activeFile.language !== "cpp") {
      setBottomMessage("[Format] Solo se soporta Format Document para C/C++ por ahora.");
      return;
    }

    try {
      const status = await invoke<ClangFormatToolStatus>("get_clang_format_status");
      setClangFormatStatus(status);

      if (!status.active_path) {
        await handleMissingClangFormatForFormatting();
        return;
      }

      const formatted = await invoke<string>("format_document_with_clang", {
        filePath: activeFile.path,
        content: activeFile.content,
      });

      setOpenFiles((prev) =>
        prev.map((file) => {
          if (file.id !== activeFile.id) return file;

          return {
            ...file,
            content: formatted,
            isDirty: formatted !== file.savedContent,
          };
        })
      );

      setBottomMessage(
        formatted === activeFile.content
          ? "[Format] Sin cambios de formato."
          : `[Format] Documento formateado con clang-format: ${activeFile.name}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.toLowerCase().includes("clang-format") && message.toLowerCase().includes("no está")) {
        await handleMissingClangFormatForFormatting();
        return;
      }

      setBottomMessage(`[Format] ${message}`);
    }
  };

  const handleSaveSettings = (nextSettings: IDESettings) => {
    setSettings(nextSettings);
    setIsSettingsOpen(false);
  };

  const handleSelectSidebar = (view: "explorer" | "search" | "tools") => {
    setActiveSidebar((current) => {
      if (current === view) {
        setIsExplorerVisible((prev) => !prev);
        return current;
      }

      setIsExplorerVisible(true);
      return view;
    });
  };

  const handleBottomResizerMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isBottomPanelVisible) return;
    event.preventDefault();

    bottomResizeRef.current = {
      startY: event.clientY,
      startHeight: bottomPanelHeight,
    };

    document.body.classList.add("is-resizing-bottom-panel");
  };

  const handleExecuteCommandPaletteAction = (actionId: CommandPaletteActionId) => {
    setIsCommandPaletteOpen(false);

    switch (actionId) {
      case "open-folder":
        void handleOpenFolder();
        break;
      case "new-file":
        void handleNewFile();
        break;
      case "new-folder":
        void handleNewFolder();
        break;
      case "build":
        void handleCompileFile();
        break;
      case "format-document":
        void handleFormatDocument();
        break;
      case "run":
        void handleRunFile();
        break;
      case "toggle-terminal":
        setIsBottomPanelVisible((prev) => {
          const next = !prev;
          if (next) {
            setActiveBottomTab("terminal");
          }
          return next;
        });
        break;
      case "quick-open-file":
        setIsQuickOpenOpen(true);
        break;
      case "close-active-tab":
        if (activeFileId) {
          handleCloseTab(activeFileId);
        }
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSave =
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s";

      if (isSave) {
        event.preventDefault();
        void handleSaveFile();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeFileId, openFiles]);

  useEffect(() => {
    if (autoSaveTimeoutRef.current !== null) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    if (!settings.autoSave || !activeFile || !activeFile.isDirty) {
      return;
    }

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      void saveFileDirectly(activeFile);
    }, 800);

    return () => {
      if (autoSaveTimeoutRef.current !== null) {
        window.clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [settings.autoSave, activeFile]);

  useEffect(() => {
    if (!hasProjectOpen) {
      void updateDiscordPresence("browsing_files", null);
      return;
    }

    if (isConsoleRunning) {
      void updateDiscordPresence("running", activeFile?.name ?? null);
      return;
    }

    if (activeFile) {
      void updateDiscordPresence("editing", activeFile.name);
      return;
    }

    void updateDiscordPresence("browsing_files", null);
  }, [
    hasProjectOpen,
    isConsoleRunning,
    activeFile?.id,
    activeFile?.name,
    projectName,
    settings.discordPresence.enabled,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isFormatDocument =
        event.shiftKey &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "f";

      if (!isFormatDocument) return;

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget) {
        return;
      }

      event.preventDefault();
      void handleFormatDocument();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeFile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isQuickOpen =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "p";

      if (!isQuickOpen || !hasProjectOpen) {
        return;
      }

      event.preventDefault();
      setIsQuickOpenOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasProjectOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isToggleSidebarShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "b";

      if (!isToggleSidebarShortcut || !hasProjectOpen) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTypingTarget) {
        return;
      }

      event.preventDefault();
      setIsExplorerVisible((prev) => !prev);
      setActiveSidebar("explorer");
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasProjectOpen]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!bottomResizeRef.current || !isBottomPanelVisible) {
        return;
      }

      const { startY, startHeight } = bottomResizeRef.current;
      const delta = startY - event.clientY;

      const workspaceHeight = mainWorkspaceRef.current?.clientHeight ?? window.innerHeight;
      const minHeight = 120;
      const maxHeight = Math.max(180, Math.floor(workspaceHeight * 0.7));
      const nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + delta));

      setBottomPanelHeight(nextHeight);
    };

    const handleMouseUp = () => {
      if (!bottomResizeRef.current) {
        return;
      }

      bottomResizeRef.current = null;
      document.body.classList.remove("is-resizing-bottom-panel");
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.classList.remove("is-resizing-bottom-panel");
    };
  }, [isBottomPanelVisible]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommandPaletteShortcut =
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "p";

      if (!isCommandPaletteShortcut || !hasProjectOpen) {
        return;
      }

      event.preventDefault();
      setIsCommandPaletteOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasProjectOpen]);

  useEffect(() => {
    return () => {
      if (interactiveChildRef.current) {
        void interactiveChildRef.current.kill();
        interactiveChildRef.current = null;
      }
    };
  }, []);

  const handleCompileFile = async () => {
    if (!activeFile) {
      setBottomMessage("[Error] No hay archivo activo para compilar.");
      return;
    }

    void updateDiscordPresence("compiling", activeFile.name);

    try {
      const saved = await handleSaveFile();
      if (!saved) return;

      const result = await invoke<CompileResult>("compile_file", {
        filePath: activeFile.path,
        projectPath,
      });

      const parsed = parseGccOutput(result.stderr);
      console.log("[DEBUG][Build] Command:", result.command);
      console.log("[DEBUG][Build] Source files:", result.source_files);
      console.log("[DEBUG][Build] Full stderr:\n", result.stderr);
      console.log("[DEBUG][Build] Parsed diagnostics:", parsed);
      setDiagnostics(parsed);
      setIsBottomPanelVisible(true);

      if (result.success) {
        await refreshExplorer();

        setBottomMessage(
          [
            "[Compilación exitosa]",
            `[Comando] ${result.command}`,
            result.stdout ? `[stdout]\n${result.stdout}` : "",
            result.stderr ? `[stderr]\n${result.stderr}` : "",
            result.executable_path
              ? `[Binario] ${result.executable_path}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        );
        setActiveBottomTab(parsed.length > 0 ? "problems" : "output");
        void updateDiscordPresence("editing", activeFile.name);
      } else {
        setBottomMessage(
          [
            "[Compilación fallida]",
            `[Comando] ${result.command}`,
            result.stdout ? `[stdout]\n${result.stdout}` : "",
            result.stderr ? `[stderr]\n${result.stderr}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        );
        setActiveBottomTab("problems");
        void updateDiscordPresence("build_failed", activeFile.name);
      }
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] No se pudo compilar: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      void updateDiscordPresence("build_failed", activeFile.name);
    }
  };

  const handleJumpToDiagnostic = async (item: DiagnosticItem) => {
    if (!item.navigable || item.file === BUILD_DIAGNOSTIC_FILE) {
      setIsBottomPanelVisible(true);
      setActiveBottomTab("output");
      setBottomMessage((prev) => `${prev}\n\n[Build][global] ${item.message}`.trim());
      return;
    }

    const existing = openFiles.find((f) => f.path === item.file);
    if (existing) {
      navigateToDiagnosticLocation(existing, item.line, item.column);
    } else {
      try {
        const content = await readTextFile(item.file);
        const name = item.file.split(/[\\/]/).pop() ?? item.file;
        const lang = detectLanguage(name);
        const newFile: IDEFile = {
          id: crypto.randomUUID(),
          name,
          path: item.file,
          language: lang,
          content,
          savedContent: content,
          isDirty: false,
        };
        setOpenFiles((prev) => [...prev, newFile]);
        navigateToDiagnosticLocation(newFile, item.line, item.column);
      } catch {
        return;
      }
    }
  };

  const handleRunFile = async () => {
    if (!activeFile) {
      setBottomMessage("[Error] No hay archivo activo para ejecutar.");
      return;
    }

    try {
      if (activeFile.isDirty) {
        const saved = await handleSaveFile();
        if (!saved) return;
      }

      await startInteractiveRun(activeFile.path);
      setBottomMessage("[Run] Ejecutando en Consola interactiva.");
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] No se pudo ejecutar: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const handleBuildAndRunFile = async () => {
    if (!activeFile) {
      setBottomMessage("[Error] No hay archivo activo para Build & Run.");
      return;
    }

    void updateDiscordPresence("compiling", activeFile.name);

    try {
      if (activeFile.isDirty) {
        const saved = await handleSaveFile();
        if (!saved) return;
      }

      const compileResult = await invoke<CompileResult>("compile_file", {
        filePath: activeFile.path,
        projectPath,
      });

      const parsedDiagnostics = parseGccOutput(compileResult.stderr);
      console.log("[DEBUG][Build & Run] Command:", compileResult.command);
      console.log("[DEBUG][Build & Run] Source files:", compileResult.source_files);
      console.log("[DEBUG][Build & Run] Full stderr:\n", compileResult.stderr);
      console.log("[DEBUG][Build & Run] Parsed diagnostics:", parsedDiagnostics);
      setDiagnostics(parsedDiagnostics);
      setIsBottomPanelVisible(true);

      if (!compileResult.success) {
        setBottomMessage(
          [
            "[Build & Run] Build fallido",
            "[Build]",
            `[Comando] ${compileResult.command}`,
            compileResult.stdout ? `[stdout]\n${compileResult.stdout}` : "",
            compileResult.stderr ? `[stderr]\n${compileResult.stderr}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        );
        setActiveBottomTab("problems");
        void updateDiscordPresence("build_failed", activeFile.name);
        return;
      }

      await refreshExplorer();

      setBottomMessage(
        [
          "[Build & Run] Build exitoso. Ejecutando en Consola interactiva...",
          "[Build]",
          `[Comando] ${compileResult.command}`,
          compileResult.stdout ? `[stdout]\n${compileResult.stdout}` : "",
          compileResult.stderr ? `[stderr]\n${compileResult.stderr}` : "",
          compileResult.executable_path
            ? `[Binario] ${compileResult.executable_path}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      );
      await startInteractiveRun(activeFile.path);
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] Falló Build & Run: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      void updateDiscordPresence("build_failed", activeFile.name);
    }
  };

  if (isAutoOpening) {
    return <div className="app-initial-shell" />;
  }

  if (!hasProjectOpen) {
    return (
      <>
        <div className="app-initial-shell">
          <WelcomeScreen
            mode="initial"
            onOpenFolder={handleOpenFolder}
            onOpenNewProjectWizard={handleOpenNewProjectFromWelcome}
            recentProjects={recentProjects.slice(0, WELCOME_RECENT_PREVIEW_LIMIT)}
            recentProjectsForModal={recentProjects.slice(0, MAX_RECENT_PROJECTS)}
            missingRecentPaths={missingRecentPaths}
            lastProjectPath={lastProjectPath}
            onOpenRecentProject={handleOpenRecentProject}
            onRemoveRecentProject={handleRemoveRecentProject}
          />
        </div>

        <NewProjectDialog
          isOpen={isNewProjectDialogOpen}
          initialLanguage={newProjectDialogLanguage}
          location={newProjectDialogLocation}
          isSubmitting={isCreatingNewProject}
          errorMessage={newProjectDialogError}
          onCancel={() => {
            if (isCreatingNewProject) return;
            setIsNewProjectDialogOpen(false);
            setNewProjectDialogError("");
          }}
          onPickLocation={handlePickNewProjectLocation}
          onSubmit={handleSubmitNewProjectDialog}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        onOpenFolder={handleOpenFolder}
        onCreateFromNewMenu={handleCreateFromNewMenu}
        onRefreshExplorer={handleRefreshExplorer}
        onToggleTerminalPanel={() => setIsBottomPanelVisible((prev) => !prev)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSaveFile={handleSaveFile}
        onFormatDocument={handleFormatDocument}
        onCompileFile={handleCompileFile}
        onRunFile={handleRunFile}
        onBuildAndRun={handleBuildAndRunFile}
      />

      <div className={`app-body ${isExplorerVisible ? "" : "app-body-explorer-hidden"}`}>
        <ActivityBar
          activeSidebar={activeSidebar}
          isSidebarVisible={isExplorerVisible}
          onSelectSidebar={handleSelectSidebar}
        />

        {isExplorerVisible && activeSidebar === "explorer" && (
          <ExplorerView
            projectName={projectName}
            projectPath={projectPath}
            tree={tree}
            activeFilePath={activeFile?.path}
            selectedNodePath={selectedNode?.path}
            onOpenFile={handleOpenFile}
            onSelectNode={setSelectedNode}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onRenameNode={handleRenameNode}
            onDeleteNode={handleDeleteNode}
            onMoveNode={handleMoveNode}
            onRefresh={handleRefreshExplorer}
          />
        )}

        {isExplorerVisible && activeSidebar === "search" && (
          <SearchView
            projectPath={projectPath}
            tree={tree}
            onOpenFile={handleOpenFile}
          />
        )}

        {isExplorerVisible && activeSidebar === "tools" && (
          <ToolsView
            clangFormatStatus={clangFormatStatus}
            isCheckingClangFormat={isCheckingClangFormat}
            isInstallingClangFormat={isInstallingClangFormat}
            onReloadClangFormatStatus={refreshClangFormatStatus}
            onUseExistingClangFormat={handleUseExistingClangFormat}
          />
        )}

        <main
          ref={mainWorkspaceRef}
          className={`main-workspace ${isBottomPanelVisible ? "" : "main-workspace-no-bottom"}`}
          style={
            isBottomPanelVisible
              ? { gridTemplateRows: `1fr 6px ${bottomPanelHeight}px` }
              : undefined
          }
        >
          {!hasActiveEditorFile ? (
            <WelcomeScreen
              mode="project"
              onNewFile={handleNewFile}
              projectName={projectName}
            />
          ) : (
            <CodeEditor
              files={openFiles}
              projectPath={projectPath}
              settings={settings}
              activeFile={activeFile}
              diagnostics={diagnostics}
              jumpToLine={jumpToLine}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
              onChangeContent={handleChangeContent}
              onCursorChange={setCursorPosition}
            />
          )}
          {isBottomPanelVisible && (
            <>
              <div
                className="bottom-panel-resizer"
                onMouseDown={handleBottomResizerMouseDown}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Redimensionar panel inferior"
              />
              <BottomPanel
                message={bottomMessage}
                projectPath={projectPath}
                activeTab={activeBottomTab}
                consoleOutput={consoleOutput}
                isConsoleRunning={isConsoleRunning}
                canRerunConsole={Boolean(lastConsoleRun)}
                terminalOutput={terminalOutput}
                isRunningTerminalCommand={isRunningTerminalCommand}
                diagnostics={diagnostics}
                onSelectTab={setActiveBottomTab}
                onSendConsoleInput={handleSendConsoleInput}
                onStopConsole={stopInteractiveProcess}
                onClearConsoleOutput={handleClearConsoleOutput}
                onRerunConsole={handleRerunConsole}
                onRunTerminalCommand={handleRunTerminalCommand}
                onClearTerminalOutput={handleClearTerminalOutput}
                onJumpToDiagnostic={handleJumpToDiagnostic}
                onToggleVisibility={() => setIsBottomPanelVisible(false)}
              />
            </>
          )}
        </main>
      </div>

      <StatusBar activeFile={activeFile} cursorPosition={cursorPosition} />

      {unsavedDialog && (
        <UnsavedDialog
          fileNames={unsavedDialog.fileNames}
          onSave={unsavedDialog.onSave}
          onDiscard={unsavedDialog.onDiscard}
          onCancel={unsavedDialog.onCancel}
        />
      )}

      <QuickOpenPalette
        isOpen={isQuickOpenOpen}
        items={quickOpenFiles}
        onClose={() => setIsQuickOpenOpen(false)}
        onOpenItem={handleQuickOpenItem}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        items={commandPaletteItems}
        onClose={() => setIsCommandPaletteOpen(false)}
        onExecute={handleExecuteCommandPaletteAction}
      />

      <SettingsDialog
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />

      <NewClassDialog
        isOpen={isNewClassDialogOpen}
        targetDirectory={newClassTargetDirectory || projectPath}
        isSubmitting={isCreatingNewClass}
        errorMessage={newClassError}
        onCancel={() => {
          if (isCreatingNewClass) return;
          setIsNewClassDialogOpen(false);
          setNewClassError("");
        }}
        onPickDirectory={handlePickNewClassDirectory}
        onSubmit={handleCreateNewCppClass}
      />

      <NewProjectDialog
        isOpen={isNewProjectDialogOpen}
        initialLanguage={newProjectDialogLanguage}
        location={newProjectDialogLocation}
        isSubmitting={isCreatingNewProject}
        errorMessage={newProjectDialogError}
        onCancel={() => {
          if (isCreatingNewProject) return;
          setIsNewProjectDialogOpen(false);
          setNewProjectDialogError("");
        }}
        onPickLocation={handlePickNewProjectLocation}
        onSubmit={handleSubmitNewProjectDialog}
      />
    </div>
  );
}