# Pipeline Completo: BUILD + DIAGNOSTICS

**Estado**: ✅ IMPLEMENTADO Y VALIDADO

---

## 1. ARQUITECTURA GENERAL

```
User Clicks Build (Ctrl+Shift+B)
         ↓
    App.tsx::handleCompileFile()
         ↓
Invoke Tauri Command: compile_file(filePath, projectPath)
         ↓
    Rust Backend (src-tauri/src/commands.rs)
    ├─ Detectar compilador (gcc/g++)
    ├─ collect_source_files_recursively(projectPath)
    │  └─ Recursively find all .c/.cpp files
    ├─ Build command: gcc/g++ {ALL_SOURCES} -Wall -Wextra -o output
    └─ Capture stdout/stderr → CompileResult
         ↓
    parseGccOutput(stderr) en App.tsx
    ├─ Parser: gcc-parser.ts::parseGccOutput()
    ├─ Detecta compiler diagnostics (file:line:col con regex)
    ├─ Detecta linker/build errors (undefined reference, ld, collect2)
    ├─ Mapea a DiagnosticItem[] con navigable: true|false
    └─ BUILD_DIAGNOSTIC_FILE = "__build__" para diagnosticos globales
         ↓
    setDiagnostics(parsed) → UI Re-render
    ├─ BottomPanel::Problems tab visualiza DiagnosticItem[]
    └─ onClick → handleJumpToDiagnostic()
         ├─ Si navigable && file != "__build__": Abre archivo, salta a línea
         └─ Else: Navega a Output tab
```

---

## 2. COMPONENTES

### Backend: Rust (src-tauri/src/commands.rs)

**Función**: `compile_file(file_path: String, project_path: String) → Result<CompileResult>`

**Flujo Interno**:
1. `get_compiler_and_output()` → Detecta gcc vs g++ basado en extensión (.c vs .cpp/.cc/.cxx)
2. `collect_source_files_recursively()` → Camina recursivamente el árbol de directorios
   - Aplica filtro de extensión (solo .c o solo .cpp dependiendo del archivo activo)
   - Retorna Vec<PathBuf> ordenado
3. Construye comando: `gcc/g++ "src1" "src2" ... "srcN" -Wall -Wextra -o output`
4. Ejecuta con `std::process::Command`
5. Retorna `CompileResult { success, command, source_files, executable_path, stdout, stderr }`

**Key Flags**:
- `-Wall -Wextra`: Habilita todos los warnings (detecta código sospechoso)

**Key Behavior**:
- Una compilación limpia si no hay source_files (error devuelto)
- Falla si compilador no está en PATH → user-friendly error message

---

### Parser: TypeScript (src/lib/gcc-parser.ts)

**Función**: `parseGccOutput(stderr: string) → DiagnosticItem[]`

**Regex Compiler**:
```typescript
/^(.+):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/
// Matches: /path/file.c:10:5: error: message
```

**Linker Error Detection**:
```typescript
const isLinkerOrBuildError =
  line.includes("undefined reference") ||
  line.includes("ld returned") ||
  line.includes("collect2") ||
  line.includes("linker command failed") ||
  (line.includes("error") && !line.includes(": note:"));
```

**Output**:
- Compiler diagnostics: `navigable: true`, ubicación real
- Linker diagnostics: `navigable: false`, `file: BUILD_DIAGNOSTIC_FILE`
- Ignora "note" level messages (no son actionables)

**Key Behavior**:
- Empty stderr → [] (clean build)
- Cada error/warning → separado DiagnosticItem
- Linker errors agrupados como "build:global"

---

### UI: React (src/components/panels/BottomPanel.tsx)

**Problems Tab Render**:
```typescript
{diagnostics.map((item) => (
  <li 
    onClick={() => onJumpToDiagnostic(item)}
    className={`diagnostic-item diagnostic-${item.severity}${item.navigable ? "" : " diagnostic-global"}`}
  >
    <span className="diagnostic-icon">{item.severity === "error" ? "✕" : "⚠"}</span>
    <span className="diagnostic-message">{item.message}</span>
    <span className="diagnostic-location">
      {item.navigable && item.file !== BUILD_DIAGNOSTIC_FILE
        ? `${filename}:${item.line}:${item.column}`
        : "build:global"}
    </span>
  </li>
))}
```

**Summary**: Contador de errores/warnings

**Key UX**:
- Error icon (✕) rojo vs Warning icon (⚠) amarillo
- Ubicación navegable: `filename:line:column` vs global: `build:global`
- Todos clickables (click behavior determinado por navigable flag)

---

### Orchestration: App.tsx

**Función**: `handleCompileFile()`

```typescript
try {
  // 1. Save active file
  const saved = await handleSaveFile();
  if (!saved) return;

  // 2. Invoke backend
  const result = await invoke<CompileResult>("compile_file", {
    filePath: activeFile.path,
    projectPath,  // ← multiarchivo key
  });

  // 3. Parse stderr
  const parsed = parseGccOutput(result.stderr);
  
  // 4. Debug logs
  console.log("[DEBUG][Build] Command:", result.command);
  console.log("[DEBUG][Build] Source files:", result.source_files);
  console.log("[DEBUG][Build] Full stderr:\n", result.stderr);
  console.log("[DEBUG][Build] Parsed diagnostics:", parsed);
  
  // 5. Update state
  setDiagnostics(parsed);
  setIsBottomPanelVisible(true);
  
  // 6. Tab routing
  if (result.success) {
    setActiveBottomTab(parsed.length > 0 ? "problems" : "output");
  } else {
    setActiveBottomTab("problems");
  }
}
```

**Función**: `handleJumpToDiagnostic(item: DiagnosticItem)`

```typescript
if (!item.navigable || item.file === BUILD_DIAGNOSTIC_FILE) {
  // Non-navigable → Output tab
  setActiveBottomTab("output");
  setBottomMessage(`${prev}\n\n[Build][global] ${item.message}`);
  return;
}

// Navigable → Open file (or focus if open) and jump to line
const existing = openFiles.find((f) => f.path === item.file);
if (existing) {
  setActiveFileId(existing.id);
} else {
  // CreateNewFile + setActiveFileId
}
setJumpToLine({ line: item.line, col: item.column, ts: Date.now() });
```

---

## 3. TEST COVERAGE

### Automated (Vitest): src/lib/gcc-parser.test.ts

✓ **6 tests** (all passing):

1. Parse compiler diagnostic with file/line/column as navigable
2. Parse warning with severity "warning"
3. Ignore "note" level messages
4. Parse multiple errors in multiple files
5. Include global diagnostic for linker error without location
6. Clean build returns empty diagnostics (no phantom entries)

**Run**: `npm test`

---

## 4. MANUAL QA

### 10-Case Checklist: docs/testing/BUILD_DIAGNOSTICS_MANUAL_QA.md

| # | Scenario | Focus |
|---|----------|-------|
| 1 | Error in open file | Marker visibility, line jump |
| 2 | Error in closed file | Auto-open file, cursor navigation |
| 3 | Warning without error | -Wall -Wextra flags, non-blocking |
| 4 | Multiple errors/files | Parsing accuracy, consistency |
| 5 | Linker undefined reference | Global diagnostic capture, non-navigable |
| 6 | Recompile after partial fix | Stale diagnostic cleanup |
| 7 | Recompile clean | Empty problems (no phantom) |
| 8 | Repeated clicks on same diagnostic | No tab duplication |
| 9 | Rapid consecutive builds | Latest-only result, no mixing |
| 10 | Multiarchivo project | All sources compiled, linker works |

**Run**:
1. Set up test project (C/C++ with multiple .c/.cpp files)
2. Follow checklist manual steps: docs/testing/BUILD_DIAGNOSTICS_MANUAL_QA.md
3. Mark ✓/❌ for each case

---

## 5. COMPILATION VALIDATION

### TypeScript
```bash
$ npx tsc --noEmit
→ TS_EXIT:0 ✓ (No type errors)
```

### Rust Backend
```bash
$ cd src-tauri && cargo check
→ RUST_CHECK_EXIT:0 ✓ (No syntax errors)
```

---

## 6. DEBUG LOGS

When running build in IDE, open DevTools (F12) → Console:

```
[DEBUG][Build] Command: gcc "C:/proj/main.c" "C:/proj/utils.c" -Wall -Wextra -o "C:/proj/main.exe"
[DEBUG][Build] Source files: ["C:/proj/main.c", "C:/proj/utils.c"]
[DEBUG][Build] Full stderr:
C:/proj/main.c:5:3: error: expected ';' before 'return'
ld returned 1 exit status

[DEBUG][Build] Parsed diagnostics: [
  { file: "C:/proj/main.c", line: 5, column: 3, severity: "error", message: "expected ';' before 'return'", navigable: true },
  { file: "__build__", line: 1, column: 1, severity: "error", message: "ld returned 1 exit status", navigable: false }
]
```

These logs help validate:
- ✓ Correct compiler detected (gcc vs g++)
- ✓ All source files discovered
- ✓ Proper flags used (-Wall -Wextra)
- ✓ Parsing accuracy for compiler vs linker errors
- ✓ navigable flag set correctly

---

## 7. KNOWN LIMITATIONS & EDGE CASES

1. **Mixed source types**: If project has both .c and .cpp, compilation uses extension of active file to filter
   - Workaround: Ensure all sources in one C or C++ → universal config needed
   
2. **Header files (.h/.hpp)**: Cannot compile directly
   - Expected: Error message shown, no compilation attempted
   
3. **Linker errors without context**: May not include exact function/symbol location
   - By design: Marked as `navigable: false` / `build:global`
   - User must review Output tab for full linker context

4. **Windows vs Unix paths**: Regex handles both `/` and `\` slashes
   - Handled by path normalization in UI

---

## 8. NEXT STEPS

### Optional Enhancements
- [ ] React Testing Library integration tests for UI race conditions
- [ ] Remove temporary debug logs after validation complete
- [ ] Add compiler warning configuration (e.g., -Wno-unused-parameter)
- [ ] Support custom build profiles (Debug vs Release)

### Critical Path
1. **Manual QA**: Run all 10 cases in BUILD_DIAGNOSTICS_MANUAL_QA.md
2. **Validate**: Confirm 10/10 pass
3. **Production**: Feature-complete and ready for user testing

---

## Summary

| Component | Status | Validation |
|-----------|--------|-----------|
| Backend (Rust) | ✅ | cargo check: OK |
| Parser (TS) | ✅ | vitest: 6/6 pass |
| UI Integration | ✅ | Types: TS_EXIT:0 |
| Manual QA Checklist | ✅ | 10 cases prepared |

**Pipeline Status**: 🟢 READY FOR MANUAL QA & USER TESTING
