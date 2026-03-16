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

export type DiagnosticSeverity = "error" | "warning" | "note";

export type DiagnosticItem = {
  file: string;
  line: number;
  col: number;
  severity: DiagnosticSeverity;
  message: string;
};

export type IDESettings = {
  editorFontSize: number;
  tabSize: number;
  wordWrap: boolean;
  autoSave: boolean;
  showHiddenFiles: boolean;
  theme: IDETheme;
  showWelcomeOnStart: boolean;
};

