export type HeaderGenerationStyle = "pragma-once" | "include-guards";

export type CppClassGenerationOptions = {
  className: string;
  namespaceName?: string;
  baseClass?: string;
  generateHeader: boolean;
  generateSource: boolean;
  headerStyle: HeaderGenerationStyle;
  generateConstructor: boolean;
  generateDestructor: boolean;
};

export type CppClassGenerationResult = {
  headerFileName: string;
  sourceFileName: string;
  headerContent: string;
  sourceContent: string;
};

const CLASS_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const normalizeNamespaceParts = (value?: string) =>
  (value ?? "")
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);

const toIncludeGuard = (fileName: string) => {
  const normalized = fileName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${normalized}_INCLUDED`;
};

const buildNamespaceOpenLines = (parts: string[]) =>
  parts.map((part) => `namespace ${part} {`);

const buildNamespaceCloseLines = (parts: string[]) =>
  [...parts]
    .reverse()
    .map((part) => `} // namespace ${part}`);

const buildClassDeclaration = (options: CppClassGenerationOptions) => {
  const inheritance = options.baseClass?.trim()
    ? ` : public ${options.baseClass.trim()}`
    : "";

  const methodLines: string[] = [];
  if (options.generateConstructor) {
    methodLines.push(`  ${options.className}();`);
  }
  if (options.generateDestructor) {
    methodLines.push(`  ~${options.className}();`);
  }

  if (methodLines.length === 0) {
    methodLines.push("  // Add constructors or methods here.");
  }

  return [
    `class ${options.className}${inheritance} {`,
    "public:",
    ...methodLines,
    "};",
  ];
};

const buildHeaderContent = (
  options: CppClassGenerationOptions,
  headerFileName: string
) => {
  const namespaceParts = normalizeNamespaceParts(options.namespaceName);
  const lines: string[] = [];

  if (options.headerStyle === "pragma-once") {
    lines.push("#pragma once", "");
  } else {
    const includeGuard = toIncludeGuard(headerFileName);
    lines.push(`#ifndef ${includeGuard}`, `#define ${includeGuard}`, "");
  }

  if (namespaceParts.length > 0) {
    lines.push(...buildNamespaceOpenLines(namespaceParts), "");
  }

  lines.push(...buildClassDeclaration(options));

  if (namespaceParts.length > 0) {
    lines.push("", ...buildNamespaceCloseLines(namespaceParts));
  }

  if (options.headerStyle === "include-guards") {
    const includeGuard = toIncludeGuard(headerFileName);
    lines.push("", `#endif // ${includeGuard}`);
  }

  return `${lines.join("\n")}\n`;
};

const buildSourceContent = (
  options: CppClassGenerationOptions,
  headerFileName: string
) => {
  const namespaceParts = normalizeNamespaceParts(options.namespaceName);
  const lines: string[] = [];

  lines.push(`#include \"${headerFileName}\"`, "");

  if (namespaceParts.length > 0) {
    lines.push(...buildNamespaceOpenLines(namespaceParts), "");
  }

  if (options.generateConstructor) {
    lines.push(`${options.className}::${options.className}() {`, "}", "");
  }

  if (options.generateDestructor) {
    lines.push(`${options.className}::~${options.className}() {`, "}", "");
  }

  if (!options.generateConstructor && !options.generateDestructor) {
    lines.push("// Add method definitions here.", "");
  }

  if (namespaceParts.length > 0) {
    lines.push(...buildNamespaceCloseLines(namespaceParts));
  }

  return `${lines.join("\n")}\n`;
};

export const isValidCppClassName = (value: string) => CLASS_NAME_RE.test(value);

export const isValidCppNamespace = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return true;

  const parts = normalizeNamespaceParts(trimmed);
  if (parts.length === 0) return false;

  return parts.every((part) => CLASS_NAME_RE.test(part));
};

export function generateCppClassFiles(
  options: CppClassGenerationOptions
): CppClassGenerationResult {
  const headerFileName = `${options.className}.h`;
  const sourceFileName = `${options.className}.cpp`;

  return {
    headerFileName,
    sourceFileName,
    headerContent: buildHeaderContent(options, headerFileName),
    sourceContent: buildSourceContent(options, headerFileName),
  };
}
