import { resolveRelativeProjectPath } from "../../lib/project-files";
import "./EditorBreadcrumbs.css";

type EditorBreadcrumbsProps = {
  projectPath: string;
  activeFilePath?: string;
};

type Segment = {
  label: string;
  isEllipsis?: boolean;
};

function compressSegments(segments: string[]): Segment[] {
  if (segments.length <= 6) {
    return segments.map((label) => ({ label }));
  }

  // Keep start and end for context on long paths:
  // src > ... > editor > deeply > nested > File.tsx
  const first = segments[0];
  const tail = segments.slice(-4);

  return [{ label: first }, { label: "...", isEllipsis: true }, ...tail.map((label) => ({ label }))];
}

export default function EditorBreadcrumbs({
  projectPath,
  activeFilePath,
}: EditorBreadcrumbsProps) {
  if (!activeFilePath) {
    return null;
  }

  const relativePath = resolveRelativeProjectPath(activeFilePath, projectPath);
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const segments = compressSegments(parts);

  return (
    <div className="editor-breadcrumbs" role="navigation" aria-label="Ruta del archivo activo">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const itemClass = `editor-breadcrumb-item${isLast ? " is-current" : ""}${segment.isEllipsis ? " is-ellipsis" : ""}`;

        return (
          <span key={`${segment.label}-${index}`} className="editor-breadcrumb-node">
            <span className={itemClass} title={segment.label}>
              {segment.label}
            </span>
            {!isLast && <span className="editor-breadcrumb-sep" aria-hidden="true">&gt;</span>}
          </span>
        );
      })}
    </div>
  );
}
