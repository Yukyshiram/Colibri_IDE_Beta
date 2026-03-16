import { useEffect, useRef, useState } from "react";
import type { FileTreeNode } from "../../types/ide";
import ExplorerTreeNode from "./ExplorerTreeNode";
import "./FileExplorer.css";

type FileExplorerProps = {
  projectName: string;
  projectPath: string;
  tree: FileTreeNode[];
  activeFilePath?: string;
  selectedNodePath?: string;
  onOpenFile: (node: FileTreeNode) => void;
  onSelectNode: (node: FileTreeNode) => void;
  onNewFile: (contextNode?: FileTreeNode) => void | Promise<void>;
  onNewFolder: (contextNode?: FileTreeNode) => void | Promise<void>;
  onRenameNode: (node: FileTreeNode) => void;
  onDeleteNode: (node: FileTreeNode) => void;
  onMoveNode: (srcPath: string, destFolderPath: string) => void | Promise<void>;
  onRefresh: () => void;
};

export default function FileExplorer({
  projectName,
  projectPath,
  tree,
  activeFilePath,
  selectedNodePath,
  onOpenFile,
  onSelectNode,
  onNewFile,
  onNewFolder,
  onRenameNode,
  onDeleteNode,
  onMoveNode,
  onRefresh,
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [blankMenuPos, setBlankMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [pointerDragFeedback, setPointerDragFeedback] = useState<{
    sourceName: string;
    sourcePath: string;
    targetPath?: string;
  } | null>(null);
  const blankMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!blankMenuPos) return;

    const close = (e: MouseEvent) => {
      if (!blankMenuRef.current?.contains(e.target as Node)) {
        setBlankMenuPos(null);
      }
    };
    const closeEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBlankMenuPos(null);
    };

    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeEsc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeEsc);
    };
  }, [blankMenuPos]);

  const handleBlankContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setBlankMenuPos({ x: e.clientX, y: e.clientY });
  };

  const shortenPath = (pathValue: string) => {
    if (pathValue.length <= 38) {
      return pathValue;
    }

    return `${pathValue.slice(0, 18)}...${pathValue.slice(-17)}`;
  };

  const handleToggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);

      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }

      return next;
    });
  };

  const handlePointerDragFeedback = (payload: {
    isDragging: boolean;
    sourceName?: string;
    sourcePath?: string;
    targetPath?: string;
  }) => {
    if (!payload.isDragging) {
      setPointerDragFeedback(null);
      return;
    }

    setPointerDragFeedback((prev) => {
      const sourceName = payload.sourceName ?? prev?.sourceName;
      const sourcePath = payload.sourcePath ?? prev?.sourcePath;

      if (!sourceName || !sourcePath) {
        return prev;
      }

      return {
        sourceName,
        sourcePath,
        targetPath: payload.targetPath,
      };
    });
  };

  return (
    <aside className="file-explorer">
      <div className="file-explorer-header">
        <div className="file-explorer-project">
          <span className="file-explorer-project-name">{projectName}</span>
          <span className="file-explorer-project-path" title={projectPath}>
            {shortenPath(projectPath)}
          </span>
        </div>
        <div className="file-explorer-actions">
          <button className="file-explorer-icon-btn" onClick={() => void onNewFile()} title="Nuevo archivo">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 3v6h6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 13v5M9.5 15.5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button className="file-explorer-icon-btn" onClick={() => void onNewFolder()} title="Nueva carpeta">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 13v5M9.5 15.5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button className="file-explorer-icon-btn" onClick={onRefresh} title="Refrescar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 5v5h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M4 19v-5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M6.7 9A8 8 0 0 1 20 10M17.3 15A8 8 0 0 1 4 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="file-explorer-section" onContextMenu={handleBlankContextMenu}>
        {pointerDragFeedback && (
          <div className="file-explorer-drag-indicator" role="status" aria-live="polite">
            <span className="drag-indicator-dot" aria-hidden="true" />
            <span className="drag-indicator-text">Moviendo {pointerDragFeedback.sourceName}</span>
            <span className="drag-indicator-arrow" aria-hidden="true">&rarr;</span>
            <span className="drag-indicator-target">
              {pointerDragFeedback.targetPath ? shortenPath(pointerDragFeedback.targetPath) : "Selecciona carpeta destino"}
            </span>
          </div>
        )}

        {blankMenuPos && (
          <div
            ref={blankMenuRef}
            className="explorer-context-menu"
            style={{ left: blankMenuPos.x, top: blankMenuPos.y }}
          >
            <button onClick={() => { setBlankMenuPos(null); void onNewFile(); }}>Nuevo archivo</button>
            <button onClick={() => { setBlankMenuPos(null); void onNewFolder(); }}>Nueva carpeta</button>
            <button onClick={() => { setBlankMenuPos(null); onRefresh(); }}>Refrescar</button>
          </div>
        )}
        <div className="file-explorer-tree">
          {tree.length === 0 ? (
            <div className="file-explorer-empty">
              Abre una carpeta para ver el proyecto
            </div>
          ) : (
            tree.map((node) => (
              <ExplorerTreeNode
                key={node.path}
                node={node}
                level={0}
                expandedFolders={expandedFolders}
                activeFilePath={activeFilePath}
                selectedNodePath={selectedNodePath}
                onToggleFolder={handleToggleFolder}
                onOpenFile={onOpenFile}
                onSelectNode={onSelectNode}
                onNewFile={onNewFile}
                onNewFolder={onNewFolder}
                onRenameNode={onRenameNode}
                onDeleteNode={onDeleteNode}
                onMoveNode={onMoveNode}
                onPointerDragFeedback={handlePointerDragFeedback}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}