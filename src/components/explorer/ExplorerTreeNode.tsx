import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { FileTreeNode } from "../../types/ide";
import { FileIcon, FolderIcon } from "../../lib/file-icons";

let pointerDragSourcePath = "";
let pointerDragMoved = false;
let pointerDragStartX = 0;
let pointerDragStartY = 0;
let suppressNextClick = false;

type ExplorerTreeNodeProps = {
  node: FileTreeNode;
  level: number;
  expandedFolders: Set<string>;
  activeFilePath?: string;
  selectedNodePath?: string;
  onToggleFolder: (folderPath: string) => void;
  onOpenFile: (node: FileTreeNode) => void;
  onSelectNode: (node: FileTreeNode) => void;
  onNewFile: (contextNode?: FileTreeNode) => void | Promise<void>;
  onNewFolder: (contextNode?: FileTreeNode) => void | Promise<void>;
  onRenameNode: (node: FileTreeNode) => void;
  onDeleteNode: (node: FileTreeNode) => void;
  onMoveNode: (srcPath: string, destFolderPath: string) => void | Promise<void>;
  onPointerDragFeedback?: (payload: {
    isDragging: boolean;
    sourceName?: string;
    sourcePath?: string;
    targetPath?: string;
  }) => void;
};

export default function ExplorerTreeNode({
  node,
  level,
  expandedFolders,
  activeFilePath,
  selectedNodePath,
  onToggleFolder,
  onOpenFile,
  onSelectNode,
  onNewFile,
  onNewFolder,
  onRenameNode,
  onDeleteNode,
  onMoveNode,
  onPointerDragFeedback,
}: ExplorerTreeNodeProps) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPointerDraggingFromThisNode, setIsPointerDraggingFromThisNode] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const paddingLeft = 10 + level * 14;
  const isSelected = selectedNodePath === node.path;

  useEffect(() => {
    if (!menuPosition) {
      return;
    }

    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuPosition(null);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuPosition(null);
      }
    };

    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuPosition]);

  const getParentPath = (pathValue: string) => {
    const normalized = pathValue.replace(/[\\/]+$/, "");
    const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));

    if (separatorIndex <= 0) {
      return normalized;
    }

    return normalized.slice(0, separatorIndex);
  };

  const handlePointerDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    pointerDragSourcePath = node.path;
    pointerDragMoved = false;
    pointerDragStartX = event.clientX;
    pointerDragStartY = event.clientY;

    const onMove = (moveEvent: MouseEvent) => {
      if (pointerDragMoved) {
        return;
      }

      const dx = Math.abs(moveEvent.clientX - pointerDragStartX);
      const dy = Math.abs(moveEvent.clientY - pointerDragStartY);

      if (dx > 5 || dy > 5) {
        pointerDragMoved = true;
        setIsPointerDraggingFromThisNode(true);
        onPointerDragFeedback?.({
          isDragging: true,
          sourceName: node.name,
          sourcePath: node.path,
          targetPath: undefined,
        });
      }
    };

    const onUp = () => {
      if (pointerDragMoved) {
        suppressNextClick = true;
      }

      setIsPointerDraggingFromThisNode(false);
      onPointerDragFeedback?.({ isDragging: false });
      pointerDragSourcePath = "";
      pointerDragMoved = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handlePointerEnter = () => {
    if (pointerDragSourcePath && pointerDragMoved) {
      setIsDragOver(true);
      const destinationPath = node.isDirectory ? node.path : getParentPath(node.path);
      onPointerDragFeedback?.({
        isDragging: true,
        sourcePath: pointerDragSourcePath,
        targetPath: destinationPath,
      });
    }
  };

  const handlePointerLeave = () => {
    setIsDragOver(false);

    if (pointerDragSourcePath && pointerDragMoved) {
      onPointerDragFeedback?.({
        isDragging: true,
        sourcePath: pointerDragSourcePath,
        targetPath: undefined,
      });
    }
  };

  const moveFromPointerDrop = (destinationFolder: string) => {
    if (!pointerDragSourcePath || !pointerDragMoved) {
      return;
    }

    setIsDragOver(false);
    const sourcePath = pointerDragSourcePath;

    if (sourcePath && sourcePath !== destinationFolder) {
      void onMoveNode(sourcePath, destinationFolder);
    }

    onPointerDragFeedback?.({ isDragging: false });
  };

  const consumeSuppressedClick = () => {
    if (!suppressNextClick) {
      return false;
    }

    suppressNextClick = false;
    return true;
  };

  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectNode(node);
    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const runAction = (action: () => void | Promise<void>) => {
    setMenuPosition(null);
    void action();
  };

  const renderContextMenu = () => {
    if (!menuPosition) {
      return null;
    }

    return (
      <div
        ref={menuRef}
        className="explorer-context-menu"
        style={{ left: menuPosition.x, top: menuPosition.y }}
      >
        {node.isDirectory && (
          <>
            <button onClick={() => runAction(() => onNewFile(node))}>Nuevo archivo</button>
            <button onClick={() => runAction(() => onNewFolder(node))}>Nueva carpeta</button>
          </>
        )}
        <button onClick={() => runAction(() => onRenameNode(node))}>Renombrar</button>
        <button className="danger" onClick={() => runAction(() => onDeleteNode(node))}>Eliminar</button>
      </div>
    );
  };

  if (node.isDirectory) {
    const isExpanded = expandedFolders.has(node.path);

    return (
      <div>
        <div
          className={`explorer-tree-row explorer-folder-row ${isSelected ? "selected" : ""} ${isDragOver ? "explorer-drag-over" : ""} ${isPointerDraggingFromThisNode ? "explorer-drag-source" : ""}`}
          style={{ paddingLeft }}
          onMouseDown={handlePointerDragStart}
          onMouseEnter={handlePointerEnter}
          onMouseLeave={handlePointerLeave}
          onMouseUp={() => moveFromPointerDrop(node.path)}
          onClick={() => {
            if (consumeSuppressedClick()) {
              return;
            }
            onSelectNode(node);
            onToggleFolder(node.path);
          }}
          onContextMenu={openContextMenu}
        >
          <span className="explorer-arrow">{isExpanded ? "▾" : "▸"}</span>
          <FolderIcon open={isExpanded} size={14} />
          <span className="explorer-label">{node.name}</span>
        </div>

        {renderContextMenu()}

        {isExpanded &&
          node.children?.map((child) => (
            <ExplorerTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              expandedFolders={expandedFolders}
              activeFilePath={activeFilePath}
              selectedNodePath={selectedNodePath}
              onToggleFolder={onToggleFolder}
              onOpenFile={onOpenFile}
              onSelectNode={onSelectNode}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onRenameNode={onRenameNode}
              onDeleteNode={onDeleteNode}
              onMoveNode={onMoveNode}
              onPointerDragFeedback={onPointerDragFeedback}
            />
          ))}
      </div>
    );
  }

  const isActive = activeFilePath === node.path;

  return (
    <>
      <div
        className={`explorer-tree-row explorer-file-row ${isActive ? "active" : ""} ${isSelected ? "selected" : ""} ${isDragOver ? "explorer-drag-over" : ""} ${isPointerDraggingFromThisNode ? "explorer-drag-source" : ""}`}
        style={{ paddingLeft }}
        onMouseDown={handlePointerDragStart}
        onMouseEnter={handlePointerEnter}
        onMouseLeave={handlePointerLeave}
        onMouseUp={() => moveFromPointerDrop(getParentPath(node.path))}
        onClick={() => {
          if (consumeSuppressedClick()) {
            return;
          }
          onSelectNode(node);
          onOpenFile(node);
        }}
        onContextMenu={openContextMenu}
      >
        <span className="explorer-arrow explorer-arrow-placeholder">▸</span>
        <FileIcon name={node.name} size={13} />
        <span className="explorer-label">{node.name}</span>
      </div>

      {renderContextMenu()}
    </>
  );
}
