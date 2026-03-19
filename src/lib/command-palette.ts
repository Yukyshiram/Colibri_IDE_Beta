export type CommandPaletteActionId =
  | "open-folder"
  | "new-file"
  | "new-folder"
  | "format-document"
  | "build"
  | "run"
  | "toggle-terminal"
  | "quick-open-file"
  | "close-active-tab";

export type CommandPaletteActionDefinition = {
  id: CommandPaletteActionId;
  label: string;
  hint?: string;
  keywords: string[];
};

export const COMMAND_PALETTE_DEFINITIONS: CommandPaletteActionDefinition[] = [
  {
    id: "open-folder",
    label: "Open Folder",
    hint: "Abrir carpeta de proyecto",
    keywords: ["open", "folder", "project", "carpeta", "abrir"],
  },
  {
    id: "new-file",
    label: "New File",
    hint: "Crear archivo nuevo",
    keywords: ["new", "file", "archivo", "crear"],
  },
  {
    id: "new-folder",
    label: "New Folder",
    hint: "Crear carpeta nueva",
    keywords: ["new", "folder", "carpeta", "crear"],
  },
  {
    id: "format-document",
    label: "Format Document",
    hint: "Formatear archivo activo con clang-format",
    keywords: ["format", "document", "clang-format", "beautify", "formatear"],
  },
  {
    id: "build",
    label: "Build",
    hint: "Compilar archivo activo",
    keywords: ["build", "compile", "compilar"],
  },
  {
    id: "run",
    label: "Run",
    hint: "Ejecutar archivo activo",
    keywords: ["run", "execute", "ejecutar"],
  },
  {
    id: "toggle-terminal",
    label: "Toggle Terminal",
    hint: "Mostrar u ocultar panel terminal",
    keywords: ["terminal", "toggle", "panel", "consola"],
  },
  {
    id: "quick-open-file",
    label: "Quick Open File",
    hint: "Abrir búsqueda rápida de archivos",
    keywords: ["quick", "open", "file", "ctrl+p", "archivo"],
  },
  {
    id: "close-active-tab",
    label: "Close Active Tab",
    hint: "Cerrar pestaña activa",
    keywords: ["close", "tab", "pestana", "cerrar"],
  },
];
