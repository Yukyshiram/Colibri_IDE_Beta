import "./ActivityBar.css";

type ActivityBarProps = {
  activeView: "explorer";
  isExplorerVisible: boolean;
  onSelectExplorer: () => void;
};

export default function ActivityBar({
  activeView,
  isExplorerVisible,
  onSelectExplorer,
}: ActivityBarProps) {
  return (
    <aside className="activity-bar" aria-label="Barra de actividad">
      <button
        className={`activity-bar-button ${activeView === "explorer" && isExplorerVisible ? "active" : ""}`}
        onClick={onSelectExplorer}
        title="Explorer"
        aria-label="Explorer"
      >
        <span aria-hidden="true">📂</span>
      </button>
    </aside>
  );
}
