export type IDEFile = {
  id: string;
  name: string;
  path: string;
  language: "c" | "cpp" | "plaintext" | "markdown";
  content: string;
  savedContent: string;
  isDirty: boolean;
};

export type FileTreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
};

export type RecentProject = {
  name: string;
  path: string;
  lastOpenedAt: number;
};

export type EditorCursorPosition = {
  line: number;
  column: number;
};

export type IDETheme = "colibri-dark" | "colibri-light";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticItem = {
  file: string;
  line: number;
  column: number;
  severity: DiagnosticSeverity;
  message: string;
  navigable: boolean;
};

export type DiagnosticFileGroup = {
  file: string; // file path o "__build__" para globales
  displayName: string; // filename o "Build & Linker Diagnostics"
  errors: DiagnosticItem[];
  warnings: DiagnosticItem[];
  isGlobal: boolean; // true si file === "__build__"
};

export type IDESettings = {
  editorFontSize: number;
  tabSize: number;
  wordWrap: boolean;
  autoSave: boolean;
  showHiddenFiles: boolean;
  theme: IDETheme;
  showWelcomeOnStart: boolean;
  discordPresence: {
    enabled: boolean;
  };
};

