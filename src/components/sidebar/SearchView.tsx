import { useMemo, useState } from "react";
import type { FileTreeNode } from "../../types/ide";
import "./SidebarViews.css";

type SearchViewProps = {
  projectPath: string;
  tree: FileTreeNode[];
  onOpenFile: (node: FileTreeNode) => void | Promise<void>;
};

type SearchResult = {
  name: string;
  path: string;
};

function flattenFileNodes(nodes: FileTreeNode[]): SearchResult[] {
  const results: SearchResult[] = [];

  const walk = (items: FileTreeNode[]) => {
    for (const item of items) {
      if (item.isDirectory) {
        if (item.children) {
          walk(item.children);
        }
        continue;
      }

      results.push({
        name: item.name,
        path: item.path,
      });
    }
  };

  walk(nodes);
  return results;
}

export default function SearchView({ projectPath, tree, onOpenFile }: SearchViewProps) {
  const [query, setQuery] = useState("");

  const allFiles = useMemo(() => flattenFileNodes(tree), [tree]);
  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!normalizedQuery) return [];

    return allFiles
      .filter((file) => file.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 120);
  }, [allFiles, normalizedQuery]);

  const getDisplayPath = (fullPath: string) => {
    if (!projectPath) return fullPath;

    const normalizedProject = projectPath.replace(/\\/g, "/").toLowerCase();
    const normalizedFull = fullPath.replace(/\\/g, "/");

    if (normalizedFull.toLowerCase().startsWith(normalizedProject)) {
      const suffix = normalizedFull.slice(projectPath.replace(/\\/g, "/").length);
      return suffix.replace(/^\/+/, "") || fullPath;
    }

    return fullPath;
  };

  const handleOpenResult = (result: SearchResult) => {
    void onOpenFile({
      name: result.name,
      path: result.path,
      isDirectory: false,
    });
  };

  return (
    <aside className="sidebar-view-shell" aria-label="Search view">
      <header className="sidebar-view-header">
        <h2>Search</h2>
      </header>

      <div className="sidebar-view-content search-view-content">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar archivo por nombre"
          className="search-view-input"
          autoComplete="off"
        />

        {!normalizedQuery ? (
          <p className="sidebar-view-muted">Escribe para buscar archivos en el proyecto actual.</p>
        ) : results.length === 0 ? (
          <p className="sidebar-view-muted">Sin resultados para "{query}".</p>
        ) : (
          <ul className="search-results-list" role="listbox" aria-label="Resultados de búsqueda">
            {results.map((result) => (
              <li key={result.path}>
                <button
                  type="button"
                  className="search-result-item"
                  onClick={() => handleOpenResult(result)}
                  title={result.path}
                >
                  <strong>{result.name}</strong>
                  <span>{getDisplayPath(result.path)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="sidebar-view-path" title={projectPath}>
          Proyecto: {projectPath || "-"}
        </p>
      </div>
    </aside>
  );
}
