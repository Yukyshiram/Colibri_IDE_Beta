export function detectLanguage(fileName: string): "c" | "cpp" | "plaintext" | "markdown" {
  if (fileName.endsWith(".c")) return "c";

  if (
    fileName.endsWith(".cpp") ||
    fileName.endsWith(".cc") ||
    fileName.endsWith(".cxx") ||
    fileName.endsWith(".h") ||
    fileName.endsWith(".hpp")
  ) {
    return "cpp";
  }

  if (fileName.endsWith(".md")) return "markdown";

  return "plaintext";
}