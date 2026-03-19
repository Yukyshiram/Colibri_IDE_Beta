import { describe, expect, it } from "vitest";
import { BUILD_DIAGNOSTIC_FILE, parseGccOutput } from "./gcc-parser";

describe("parseGccOutput", () => {
  it("parsea error sintactico con archivo/linea/columna como navegable", () => {
    const stderr = "C:/proj/main.c:12:5: error: expected ';' before 'return'";

    const diagnostics = parseGccOutput(stderr);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({
      file: "C:/proj/main.c",
      line: 12,
      column: 5,
      severity: "error",
      message: "expected ';' before 'return'",
      navigable: true,
    });
  });

  it("parsea warning con severidad warning", () => {
    const stderr = "C:/proj/utils.c:8:9: warning: unused variable 'tmp'";

    const diagnostics = parseGccOutput(stderr);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("warning");
    expect(diagnostics[0].navigable).toBe(true);
  });

  it("ignora notas de compilador", () => {
    const stderr = "C:/proj/main.c:3:1: note: declared here";

    const diagnostics = parseGccOutput(stderr);

    expect(diagnostics).toHaveLength(0);
  });

  it("parsea errores multiples en multiples archivos", () => {
    const stderr = [
      "C:/proj/main.c:4:3: error: 'x' undeclared (first use in this function)",
      "C:/proj/utils.c:10:2: warning: implicit declaration of function 'foo'",
      "C:/proj/math.c:7:1: error: expected declaration specifiers before '}' token",
    ].join("\n");

    const diagnostics = parseGccOutput(stderr);

    expect(diagnostics).toHaveLength(3);
    expect(diagnostics.map((d) => d.file)).toEqual([
      "C:/proj/main.c",
      "C:/proj/utils.c",
      "C:/proj/math.c",
    ]);
  });

  it("incluye diagnostico global para linker error sin ubicacion", () => {
    const stderr = "C:/msys64/ucrt64/bin/ld.exe: main.o: in function `main':\nundefined reference to `sumar'\ncollect2.exe: error: ld returned 1 exit status";

    const diagnostics = parseGccOutput(stderr);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.some((d) => d.file === BUILD_DIAGNOSTIC_FILE)).toBe(true);
    expect(diagnostics.some((d) => d.navigable === false)).toBe(true);
    expect(diagnostics.some((d) => d.message.toLowerCase().includes("undefined reference"))).toBe(true);
  });

  it("en recompilacion limpia no deja diagnosticos fantasma (lista vacia)", () => {
    const diagnostics = parseGccOutput("");
    expect(diagnostics).toEqual([]);
  });
});
