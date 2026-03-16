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

import "./App.css";

import TopBar from "./components/layout/TopBar";
import ActivityBar from "./components/layout/ActivityBar";
import StatusBar from "./components/layout/StatusBar";
import FileExplorer from "./components/explorer/FileExplorer";
import CodeEditor from "./components/editor/CodeEditor";
import WelcomeScreen from "./components/editor/WelcomeScreen";
import BottomPanel from "./components/panels/BottomPanel";
import UnsavedDialog from "./components/editor/UnsavedDialog";
import QuickOpenPalette from "./components/editor/QuickOpenPalette";
import CommandPalette, { type CommandPaletteItem } from "./components/editor/CommandPalette";
import SettingsDialog from "./components/layout/SettingsDialog";

import type { IDEFile, FileTreeNode, RecentProject, EditorCursorPosition, IDESettings, DiagnosticItem } from "./types/ide";
import { detectLanguage } from "./lib/file-utils";
import { parseGccOutput } from "./lib/gcc-parser";
import { flattenProjectFiles, type QuickOpenFileItem } from "./lib/project-files";
import { COMMAND_PALETTE_DEFINITIONS, type CommandPaletteActionId } from "./lib/command-palette";
import { applyThemeToDocument, loadIDESettings, saveIDESettings } from "./lib/settings";

type CompileResult = {
  success: boolean;
  command: string;
  executable_path?: string | null;
  stdout: string;
  stderr: string;
};

type RunResult = {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exit_code?: number | null;
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

const RECENT_PROJECTS_STORAGE_KEY = "colibri.recentProjects";
const LAST_PROJECT_STORAGE_KEY = "colibri.lastProjectPath";
const MAX_RECENT_PROJECTS = 8;

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
  const [lastProjectPath, setLastProjectPath] = useState("");
  const [invalidRecentPaths, setInvalidRecentPaths] = useState<Set<string>>(new Set());
  const [bottomMessage, setBottomMessage] = useState("[Colibrí IDE] Listo.");
  const [terminalOutput, setTerminalOutput] = useState("[Terminal] Lista. Escribe un comando y presiona Enter.");
  const [isRunningTerminalCommand, setIsRunningTerminalCommand] = useState(false);
  const [isBottomPanelVisible, setIsBottomPanelVisible] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState<"output" | "terminal" | "problemas">("output");
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [jumpToLine, setJumpToLine] = useState<{ line: number; col: number; ts: number } | null>(null);
  const [activeSideView, setActiveSideView] = useState<"explorer">("explorer");
  const [cursorPosition, setCursorPosition] = useState<EditorCursorPosition>({ line: 1, column: 1 });
  const [unsavedDialog, setUnsavedDialog] = useState<UnsavedDialogConfig | null>(null);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAutoOpening, setIsAutoOpening] = useState(false);
  const watcherCleanupRef = useRef<UnwatchFn | null>(null);
  const refreshDebounceRef = useRef<number | null>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);

  const activeFile = useMemo(() => {
    return openFiles.find((file) => file.id === activeFileId);
  }, [openFiles, activeFileId]);

  const hasProjectOpen = Boolean(projectPath);
  const hasActiveEditorFile = openFiles.length > 0;
  const quickOpenFiles = useMemo(
    () => flattenProjectFiles(tree, projectPath),
    [tree, projectPath]
  );
  const commandPaletteItems = useMemo<CommandPaletteItem[]>(() => {
    const isFileContextAvailable = Boolean(projectPath);
    const hasActiveFile = Boolean(activeFile);

    return COMMAND_PALETTE_DEFINITIONS.map((definition) => {
      let disabled = false;

      if (definition.id === "new-file" || definition.id === "new-folder") {
        disabled = !isFileContextAvailable;
      }

      if (definition.id === "build" || definition.id === "run" || definition.id === "close-active-tab") {
        disabled = !hasActiveFile;
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
                await saveFileDirectly(file);
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

    setProjectPath(targetPath);
    setProjectName(projectFolderName);
    setTree(mappedTree);
    setSelectedNode(null);
    setOpenFiles([]);
    setActiveFileId("");
    setDiagnostics([]);
    setJumpToLine(null);
    upsertRecentProject(targetPath);
    setBottomMessage(`[Colibrí IDE] Proyecto abierto: ${targetPath}`);
  };

  useEffect(() => {
    setRecentProjects(loadRecentProjects());
    const rememberedLastProjectPath = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY) ?? "";
    setLastProjectPath(rememberedLastProjectPath);

    if (!settings.showWelcomeOnStart && rememberedLastProjectPath) {
      setIsAutoOpening(true);
      void (async () => {
        try {
          const pathExists = await exists(rememberedLastProjectPath);
          if (pathExists) {
            await openProjectFolder(rememberedLastProjectPath);
          }
        } finally {
          setIsAutoOpening(false);
        }
      })();
    }
  }, []);

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
        setInvalidRecentPaths((prev) => new Set(prev).add(targetPath));
        return;
      }
      setInvalidRecentPaths((prev) => {
        if (!prev.has(targetPath)) return prev;
        const next = new Set(prev);
        next.delete(targetPath);
        return next;
      });
      await openProjectFolder(targetPath);
    } catch (error) {
      console.error(error);
      setInvalidRecentPaths((prev) => new Set(prev).add(targetPath));
    }
  };

  const handleRemoveRecentProject = (targetPath: string) => {
    setRecentProjects((prev) => {
      const next = prev.filter((p) => p.path !== targetPath);
      saveRecentProjects(next);
      return next;
    });
    setInvalidRecentPaths((prev) => {
      if (!prev.has(targetPath)) return prev;
      const next = new Set(prev);
      next.delete(targetPath);
      return next;
    });
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

  const handleNewFile = async (contextNode?: FileTreeNode) => {
    if (!projectPath) {
      setBottomMessage("[Error] Abre una carpeta antes de crear un archivo nuevo.");
      return;
    }

    try {
      const requestedName = window.prompt("Nombre del archivo nuevo", "main.c");
      const fileName = requestedName?.trim();

      if (!fileName) return;

      const targetDirectory = resolveTargetDirectory(contextNode);
      const filePath = await join(targetDirectory, fileName);

      const fileAlreadyExists = await exists(filePath);
      if (fileAlreadyExists) {
        setBottomMessage(`[Error] Ya existe un archivo con ese nombre: ${fileName}`);
        return;
      }

      await writeTextFile(filePath, "");

      const newFile: IDEFile = {
        id: crypto.randomUUID(),
        name: fileName,
        path: filePath,
        language: detectLanguage(fileName),
        content: "",
        savedContent: "",
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
    const idx = openFiles.findIndex((f) => f.id === fileId);
    const fileToClose = openFiles[idx];

    const performClose = () => {
      setOpenFiles((prev) => prev.filter((file) => file.id !== fileId));
      if (fileId === activeFileId) {
        const updated = openFiles.filter((f) => f.id !== fileId);
        const nextFile = updated[idx] ?? updated[idx - 1];
        setActiveFileId(nextFile?.id ?? "");
      }
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

  const handleSaveSettings = (nextSettings: IDESettings) => {
    setSettings(nextSettings);
    setIsSettingsOpen(false);
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

  const handleCompileFile = async () => {
    if (!activeFile) {
      setBottomMessage("[Error] No hay archivo activo para compilar.");
      return;
    }

    try {
      const saved = await handleSaveFile();
      if (!saved) return;

      const result = await invoke<CompileResult>("compile_file", {
        filePath: activeFile.path,
      });

      const parsed = parseGccOutput(result.stderr);
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
        setActiveBottomTab(parsed.length > 0 ? "problemas" : "output");
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
        setActiveBottomTab("problemas");
      }
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] No se pudo compilar: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const handleJumpToDiagnostic = async (item: DiagnosticItem) => {
    const existing = openFiles.find((f) => f.path === item.file);
    if (existing) {
      setActiveFileId(existing.id);
    } else {
      try {
        const content = await readTextFile(item.file);
        const name = item.file.split(/[\\/]/).pop() ?? item.file;
        const lang = detectLanguage(name);
        const newFile: IDEFile = {
          id: `${item.file}-${Date.now()}`,
          name,
          path: item.file,
          language: lang,
          content,
          savedContent: content,
          isDirty: false,
        };
        setOpenFiles((prev) => [...prev, newFile]);
        setActiveFileId(newFile.id);
      } catch {
        return;
      }
    }
    setJumpToLine({ line: item.line, col: item.col, ts: Date.now() });
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

      const result = await invoke<RunResult>("run_file", {
        filePath: activeFile.path,
      });

      setBottomMessage(
        [
          result.success ? "[Ejecución completada]" : "[Ejecución con errores]",
          `[Comando] ${result.command}`,
          result.exit_code !== undefined && result.exit_code !== null
            ? `[Exit code] ${result.exit_code}`
            : "",
          result.stdout ? `[stdout]\n${result.stdout}` : "",
          result.stderr ? `[stderr]\n${result.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      );
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

    try {
      if (activeFile.isDirty) {
        const saved = await handleSaveFile();
        if (!saved) return;
      }

      const compileResult = await invoke<CompileResult>("compile_file", {
        filePath: activeFile.path,
      });

      const parsedDiagnostics = parseGccOutput(compileResult.stderr);
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
        setActiveBottomTab("problemas");
        return;
      }

      await refreshExplorer();

      const runResult = await invoke<RunResult>("run_file", {
        filePath: activeFile.path,
      });

      setBottomMessage(
        [
          runResult.success
            ? "[Build & Run] Completado"
            : "[Build & Run] Build exitoso, Run con errores",
          "[Build]",
          `[Comando] ${compileResult.command}`,
          compileResult.stdout ? `[stdout]\n${compileResult.stdout}` : "",
          compileResult.stderr ? `[stderr]\n${compileResult.stderr}` : "",
          compileResult.executable_path
            ? `[Binario] ${compileResult.executable_path}`
            : "",
          "[Run]",
          `[Comando] ${runResult.command}`,
          runResult.exit_code !== undefined && runResult.exit_code !== null
            ? `[Exit code] ${runResult.exit_code}`
            : "",
          runResult.stdout ? `[stdout]\n${runResult.stdout}` : "",
          runResult.stderr ? `[stderr]\n${runResult.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      );
      setActiveBottomTab("output");
    } catch (error) {
      console.error(error);
      setBottomMessage(
        `[Error] Falló Build & Run: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  if (isAutoOpening) {
    return <div className="app-initial-shell" />;
  }

  if (!hasProjectOpen) {
    return (
      <div className="app-initial-shell">
        <WelcomeScreen
          mode="initial"
          onOpenFolder={handleOpenFolder}
          recentProjects={recentProjects}
          lastProjectPath={lastProjectPath}
          onOpenRecentProject={handleOpenRecentProject}
          invalidRecentPaths={invalidRecentPaths}
          onRemoveRecentProject={handleRemoveRecentProject}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        onOpenFolder={handleOpenFolder}
        onRefreshExplorer={handleRefreshExplorer}
        onToggleTerminalPanel={() => setIsBottomPanelVisible((prev) => !prev)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSaveFile={handleSaveFile}
        onCompileFile={handleCompileFile}
        onRunFile={handleRunFile}
        onBuildAndRun={handleBuildAndRunFile}
      />

      <div className="app-body">
        <ActivityBar
          activeView={activeSideView}
          onSelectExplorer={() => setActiveSideView("explorer")}
        />

        {activeSideView === "explorer" && (
          <FileExplorer
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

        <main className={`main-workspace ${isBottomPanelVisible ? "" : "main-workspace-no-bottom"}`}>
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
            <BottomPanel
              message={bottomMessage}
              projectPath={projectPath}
              activeTab={activeBottomTab}
              terminalOutput={terminalOutput}
              isRunningTerminalCommand={isRunningTerminalCommand}
              diagnostics={diagnostics}
              onSelectTab={setActiveBottomTab}
              onRunTerminalCommand={handleRunTerminalCommand}
              onClearTerminalOutput={handleClearTerminalOutput}
              onJumpToDiagnostic={handleJumpToDiagnostic}
              onToggleVisibility={() => setIsBottomPanelVisible(false)}
            />
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
    </div>
  );
}