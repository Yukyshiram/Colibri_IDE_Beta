import type { FileTreeNode } from "../types/ide";

export type QuickOpenFileItem = {
  name: string;
  path: string;
  relativePath: string;
  node: FileTreeNode;
};

export function resolveRelativeProjectPath(fullPath: string, projectPath: string): string {
  if (!projectPath) return fullPath;

  const normalizedFull = fullPath.replace(/\\/g, "/");
  const normalizedProject = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");

  if (!normalizedFull.startsWith(normalizedProject)) {
    return normalizedFull;
  }

  const sliced = normalizedFull.slice(normalizedProject.length).replace(/^\/+/, "");
  return sliced || normalizedFull;
}

export function flattenProjectFiles(tree: FileTreeNode[], projectPath: string): QuickOpenFileItem[] {
  const files: QuickOpenFileItem[] = [];

  const walk = (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      if (node.isDirectory) {
        if (node.children?.length) {
          walk(node.children);
        }
        continue;
      }

      files.push({
        name: node.name,
        path: node.path,
        relativePath: resolveRelativeProjectPath(node.path, projectPath),
        node,
      });
    }
  };

  walk(tree);

  files.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.relativePath.localeCompare(b.relativePath);
  });

  return files;
}
