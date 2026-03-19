import type { DiagnosticItem, DiagnosticFileGroup } from "../types/ide";

export const BUILD_DIAGNOSTIC_GROUP_NAME = "Build & Linker Diagnostics";

/**
 * Agrupa diagnósticos por archivo.
 * Orden: primero archivos con errores, luego archivos con warnings, luego globales.
 */
export function groupDiagnosticsByFile(items: DiagnosticItem[]): DiagnosticFileGroup[] {
  const map = new Map<string, DiagnosticFileGroup>();

  // 1. Iterar items y agrupar por file
  for (const item of items) {
    if (!map.has(item.file)) {
      map.set(item.file, {
        file: item.file,
        displayName:
          item.file === "__build__"
            ? BUILD_DIAGNOSTIC_GROUP_NAME
            : item.file.split(/[\\/]/).pop() ?? item.file,
        errors: [],
        warnings: [],
        isGlobal: item.file === "__build__",
      });
    }

    const group = map.get(item.file)!;
    if (item.severity === "error") {
      group.errors.push(item);
    } else {
      group.warnings.push(item);
    }
  }

  // 2. Convertir map a array y aplicar ordenamiento
  const groups = Array.from(map.values());

  groups.sort((a, b) => {
    // Globales al final
    if (a.isGlobal && !b.isGlobal) return 1;
    if (!a.isGlobal && b.isGlobal) return -1;
    if (a.isGlobal && b.isGlobal) return 0;

    // Archivos con errores primero
    const aHasErrors = a.errors.length > 0;
    const bHasErrors = b.errors.length > 0;
    if (aHasErrors && !bHasErrors) return -1;
    if (!aHasErrors && bHasErrors) return 1;

    // Dentro de la misma categoría, orden alfabético
    return a.displayName.localeCompare(b.displayName);
  });

  return groups;
}
