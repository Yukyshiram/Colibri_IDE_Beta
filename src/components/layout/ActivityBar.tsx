import "./ActivityBar.css";

type ActivityBarProps = {
  activeView: "explorer";
  onSelectExplorer: () => void;
};

export default function ActivityBar({
  activeView,
  onSelectExplorer,
}: ActivityBarProps) {
  return (
    <aside className="activity-bar" aria-label="Barra de actividad">
      <button
        className={`activity-bar-button ${activeView === "explorer" ? "active" : ""}`}
        onClick={onSelectExplorer}
        title="Explorer"
        aria-label="Explorer"
      >
        <span aria-hidden="true">📂</span>
      </button>
    </aside>
  );
}
