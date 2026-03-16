import type { DiagnosticItem } from "../types/ide";

// GCC/G++ stderr line format:
//   /path/to/file.c:10:5: error: undeclared identifier 'x'
//   /path/to/file.c:10:5: warning: implicit function declaration
//   /path/to/file.c:10:5: note: declared here
// On Windows, paths can start with a drive letter: C:/path/to/file.c:10:5: error: ...
const GCC_DIAG_RE = /^(.+):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/;

export function parseGccOutput(stderr: string): DiagnosticItem[] {
  if (!stderr) return [];
  const items: DiagnosticItem[] = [];

  for (const rawLine of stderr.split("\n")) {
    const line = rawLine.trimEnd();
    const match = GCC_DIAG_RE.exec(line);
    if (!match) continue;

    const [, file, lineStr, colStr, severity, message] = match;
    items.push({
      file: file.trim(),
      line: parseInt(lineStr, 10),
      col: parseInt(colStr, 10),
      severity: severity as DiagnosticItem["severity"],
      message: message.trim(),
    });
  }

  return items;
}
