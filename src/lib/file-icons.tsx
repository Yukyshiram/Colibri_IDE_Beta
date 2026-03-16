/**
 * file-icons.tsx
 *
 * Central file-icon resolver. Used by:
 *  - ExplorerTreeNode  (explorer sidebar)
 *  - CodeEditor        (tab strip)
 *
 * To add a new extension, just add an entry to EXT_COLORS below.
 */

// ── Extension → accent color ──────────────────────────────────────────────
const EXT_COLORS: Record<string, string> = {
  // C family
  c:         "#78f7a5",
  cpp:       "#7ed3ff",
  cc:        "#7ed3ff",
  cxx:       "#7ed3ff",
  h:         "#f9c74f",
  hpp:       "#f9c74f",
  // Rust
  rs:        "#fe8019",
  // Python
  py:        "#a6e3a1",
  // JavaScript / TypeScript
  js:        "#f9e2af",
  mjs:       "#f9e2af",
  cjs:       "#f9e2af",
  ts:        "#89b4fa",
  tsx:       "#74c7ec",
  jsx:       "#74c7ec",
  // Web
  css:       "#89dceb",
  scss:      "#f38ba8",
  html:      "#fab387",
  htm:       "#fab387",
  // Data / config
  json:      "#f9e2af",
  toml:      "#fab387",
  yaml:      "#cba6f7",
  yml:       "#cba6f7",
  xml:       "#fab387",
  // Docs
  md:        "#c7b7ff",
  txt:       "#a6adc8",
  // Build / scripts
  sh:        "#a6e3a1",
  bash:      "#a6e3a1",
  bat:       "#89b4fa",
  ps1:       "#89b4fa",
  cmake:     "#f9e2af",
  // Compiled artefacts
  exe:       "#f99999",
  dll:       "#6c7086",
  obj:       "#585b70",
  o:         "#585b70",
  a:         "#585b70",
  lib:       "#585b70",
  // Version control / misc
  gitignore: "#f38ba8",
  lock:      "#585b70",
};

const GENERIC_COLOR = "#585b70";
const FOLDER_COLOR  = "#f9e2af";

function getExt(fileName: string): string {
  // Handles dotfiles like .gitignore → ext = "gitignore"
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

/** Returns the accent color for the given file name. */
export function resolveFileIconColor(fileName: string): string {
  return EXT_COLORS[getExt(fileName)] ?? GENERIC_COLOR;
}

// ── File icon ─────────────────────────────────────────────────────────────
type FileIconProps = {
  name: string;
  size?: number;
};

/**
 * Renders a minimal document SVG whose color is determined by the file
 * extension. Drop-in replacement for colored dots in explorer and tabs.
 */
export function FileIcon({ name, size = 13 }: FileIconProps) {
  const color = resolveFileIconColor(name);
  // viewBox 0 0 12 14  →  document shape with top-right folded corner
  const h = Math.round((size * 14) / 12);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 12 14"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {/* document body */}
      <path
        d="M1 1.5 L7 1.5 L10.5 5 L10.5 12.5 L1 12.5 Z"
        fill={color}
        fillOpacity={0.15}
        stroke={color}
        strokeWidth={0.85}
        strokeLinejoin="round"
      />
      {/* folded corner mark */}
      <path
        d="M7 1.5 L7 5 L10.5 5"
        fill="none"
        stroke={color}
        strokeWidth={0.85}
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Folder icon ───────────────────────────────────────────────────────────
type FolderIconProps = {
  open?: boolean;
  size?: number;
};

/**
 * Renders a minimal folder SVG. `open` changes the fill opacity and
 * shows content-hint lines to visually differentiate expanded folders.
 */
export function FolderIcon({ open = false, size = 13 }: FolderIconProps) {
  const color = FOLDER_COLOR;
  // viewBox 0 0 14 12  →  folder with small tab on top-left
  const h = Math.round((size * 12) / 14);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 14 12"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {/* folder body + tab */}
      <path
        d="M1 2.5 L5.5 2.5 L6.5 4 L13 4 L13 11 L1 11 Z"
        fill={color}
        fillOpacity={open ? 0.28 : 0.16}
        stroke={color}
        strokeWidth={0.85}
        strokeLinejoin="round"
      />
      {open && (
        /* subtle content-hint lines visible only when folder is expanded */
        <>
          <line
            x1="3" y1="6.5" x2="11" y2="6.5"
            stroke={color} strokeWidth={0.65}
            strokeOpacity={0.5} strokeLinecap="round"
          />
          <line
            x1="3" y1="8.5" x2="8.5" y2="8.5"
            stroke={color} strokeWidth={0.65}
            strokeOpacity={0.5} strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
