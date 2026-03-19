import { useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import type * as MonacoNS from "monaco-editor";
import type { IDEFile, EditorCursorPosition, IDESettings, DiagnosticItem } from "../../types/ide";
import { FileIcon } from "../../lib/file-icons";
import EditorBreadcrumbs from "./EditorBreadcrumbs";
import "./CodeEditor.css";

type CodeEditorProps = {
    files: IDEFile[];
    projectPath: string;
    settings: IDESettings;
    activeFile?: IDEFile;
    diagnostics?: DiagnosticItem[];
    jumpToLine?: { line: number; col: number; ts: number } | null;
    onSelectTab: (fileId: string) => void;
    onCloseTab: (fileId: string) => void;
    onChangeContent: (value: string) => void;
    onCursorChange?: (position: EditorCursorPosition) => void;
};

export default function CodeEditor({
    files,
    projectPath,
    settings,
    activeFile,
    diagnostics,
    jumpToLine,
    onSelectTab,
    onCloseTab,
    onChangeContent,
    onCursorChange,
}: CodeEditorProps) {
    type Monaco = typeof MonacoNS;
    const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const jumpToLineRef = useRef(jumpToLine);
    const editorAreaRef = useRef<HTMLDivElement | null>(null);
    const lastAppliedJumpTsRef = useRef<number | null>(null);

    const applyJump = (jump: { line: number; col: number; ts: number }) => {
        const ed = editorRef.current;
        if (!ed) return;

        if (lastAppliedJumpTsRef.current === jump.ts) {
            return;
        }

        const currentPosition = ed.getPosition();
        const isSamePosition =
            currentPosition?.lineNumber === jump.line &&
            currentPosition?.column === jump.col;

        if (!isSamePosition) {
            ed.setPosition({ lineNumber: jump.line, column: jump.col });
            ed.revealLineInCenter(jump.line);
        }

        ed.focus();
        lastAppliedJumpTsRef.current = jump.ts;
    };

    useEffect(() => {
        jumpToLineRef.current = jumpToLine;
    }, [jumpToLine]);

    // Jump to line when the editor is already mounted (same file active)
    useEffect(() => {
        if (!jumpToLine || !editorRef.current) return;
        applyJump(jumpToLine);
    }, [jumpToLine]);

    // Apply diagnostic markers whenever diagnostics change (same editor mounted)
    useEffect(() => {
        if (!monacoRef.current || !editorRef.current || !activeFile) return;
        const model = editorRef.current.getModel();
        if (!model) return;
        applyMarkers(monacoRef.current, model, diagnostics ?? [], activeFile.path);
    // activeFile dep omitted intentionally: editor remounts on file change (key=activeFile.id),
    // which triggers onMount where markers are also applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [diagnostics]);

    // Keep Monaco layout synced with container resize (e.g. toggling sidebar with Ctrl+B)
    useEffect(() => {
        if (!editorAreaRef.current) return;

        let rafId: number | null = null;
        const relayout = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }

            rafId = requestAnimationFrame(() => {
                editorRef.current?.layout();
                rafId = null;
            });
        };

        const observer = new ResizeObserver(() => {
            relayout();
        });

        observer.observe(editorAreaRef.current);
        window.addEventListener("resize", relayout);
        relayout();

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", relayout);
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, [activeFile?.id]);

    const applyMarkers = (
        monaco: typeof MonacoNS,
        model: MonacoNS.editor.ITextModel,
        items: DiagnosticItem[],
        filePath: string
    ) => {
        const normalize = (s: string) => s.replace(/\\/g, "/").toLowerCase();
        const markers: MonacoNS.editor.IMarkerData[] = items
            .filter((d) => normalize(d.file) === normalize(filePath))
            .map((d) => ({
                startLineNumber: d.line,
                startColumn: d.column,
                endLineNumber: d.line,
                endColumn: d.column + 1,
                severity:
                    d.severity === "error"
                        ? monaco.MarkerSeverity.Error
                        : d.severity === "warning"
                        ? monaco.MarkerSeverity.Warning
                        : monaco.MarkerSeverity.Info,
                message: d.message,
            }));
        monaco.editor.setModelMarkers(model, "gcc-colibri", markers);
    };

    return (
        <section className="code-editor">
        <EditorBreadcrumbs
            projectPath={projectPath}
            activeFilePath={activeFile?.path}
        />
        <div className="editor-tabs">
                {files.map((file) => (
                    <div
                        key={file.id}
                        className={`editor-tab${activeFile?.id === file.id ? " active" : ""}${file.isDirty ? " dirty" : ""}`}
                        title={file.path}
                        onClick={() => onSelectTab(file.id)}
                        onMouseDown={(e) => {
                            if (e.button === 1) {
                                e.preventDefault();
                                onCloseTab(file.id);
                            }
                        }}
                    >
                        <FileIcon name={file.name} size={12} />
                        <span className="editor-tab-name">{file.name}</span>
                        <span className="editor-tab-controls" aria-hidden="true">
                            <span className="editor-tab-dirty-dot">●</span>
                            <button
                                className="editor-tab-close"
                                tabIndex={-1}
                                onClick={(e) => { e.stopPropagation(); onCloseTab(file.id); }}
                                aria-label={`Cerrar ${file.name}`}
                            >
                                ×
                            </button>
                        </span>
                    </div>
                ))}
            </div>

            <div className="editor-area" ref={editorAreaRef}>
                {activeFile ? (
                    <Editor
                        key={activeFile.id}
                        height="100%"
                        language={activeFile.language}
                        value={activeFile.content}
                        theme={settings.theme === "colibri-light" ? "vs" : "vs-dark"}
                        onChange={(value) => onChangeContent(value ?? "")}
                        onMount={(editorInstance, monacoInstance) => {
                            editorRef.current = editorInstance;
                            monacoRef.current = monacoInstance;
                            editorInstance.onDidChangeCursorPosition((e) => {
                                onCursorChange?.({
                                    line: e.position.lineNumber,
                                    column: e.position.column,
                                });
                            });
                            // Apply diagnostics markers for this file
                            const model = editorInstance.getModel();
                            if (model && diagnostics && diagnostics.length > 0 && activeFile) {
                                applyMarkers(monacoInstance, model, diagnostics, activeFile.path);
                            }
                            // Apply pending jump-to-line
                            const pending = jumpToLineRef.current;
                            if (pending) {
                                applyJump(pending);
                            }
                        }}
                        options={{
                            minimap: { enabled: true },
                            fontSize: settings.editorFontSize,
                            automaticLayout: true,
                            scrollBeyondLastLine: false,
                            tabSize: settings.tabSize,
                            insertSpaces: true,
                            wordWrap: settings.wordWrap ? "on" : "off",
                            smoothScrolling: true,
                            padding: { top: 16 },
                        }}
                    />
                ) : (
                    <div className="editor-empty-state">
                        <p>Abre un archivo desde el explorador</p>
                    </div>
                )}
            </div>
        </section>
    );
}