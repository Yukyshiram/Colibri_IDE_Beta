export type ConsoleProjectTemplate = "hello-world" | "minimal";

export type GenerateConsoleMainOptions = {
  language: "c" | "cpp";
  template: ConsoleProjectTemplate;
};

export function generateConsoleMainContent({
  language,
  template,
}: GenerateConsoleMainOptions): string {
  if (language === "cpp") {
    if (template === "minimal") {
      return [
        "int main() {",
        "  return 0;",
        "}",
        "",
      ].join("\n");
    }

    return [
      "#include <iostream>",
      "",
      "int main() {",
      "  std::cout << \"Hello from Colibri IDE!\\n\";",
      "  return 0;",
      "}",
      "",
    ].join("\n");
  }

  if (template === "minimal") {
    return [
      "int main(void) {",
      "  return 0;",
      "}",
      "",
    ].join("\n");
  }

  return [
    "#include <stdio.h>",
    "",
    "int main(void) {",
    "  printf(\"Hello from Colibri IDE!\\n\");",
    "  return 0;",
    "}",
    "",
  ].join("\n");
}
