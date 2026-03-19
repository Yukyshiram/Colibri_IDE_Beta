import type { DiagnosticItem } from "../types/ide";

export const BUILD_DIAGNOSTIC_FILE = "__build__";

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
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = GCC_DIAG_RE.exec(line);
    if (match) {
      const [, file, lineStr, colStr, severity, message] = match;
      if (severity === "note") continue;

      items.push({
        file: file.trim(),
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        severity: severity as "error" | "warning",
        message: message.trim(),
        navigable: true,
      });
      continue;
    }

    const lower = trimmed.toLowerCase();
    const isLinkerOrBuildError =
      lower.includes("undefined reference") ||
      lower.includes("ld returned") ||
      lower.includes("collect2") ||
      lower.includes("linker command failed") ||
      (lower.includes("error") && !lower.includes(": note:"));

    const isBuildWarning = lower.includes("warning");

    if (!isLinkerOrBuildError && !isBuildWarning) continue;

    items.push({
      file: BUILD_DIAGNOSTIC_FILE,
      line: 1,
      column: 1,
      severity: isLinkerOrBuildError ? "error" : "warning",
      message: trimmed,
      navigable: false,
    });
  }

  return items;
}
