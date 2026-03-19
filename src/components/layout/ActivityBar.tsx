import "./ActivityBar.css";

type ActivityBarProps = {
  activeSidebar: "explorer" | "search" | "tools";
  isSidebarVisible: boolean;
  onSelectSidebar: (view: "explorer" | "search" | "tools") => void;
};

export default function ActivityBar({
  activeSidebar,
  isSidebarVisible,
  onSelectSidebar,
}: ActivityBarProps) {
  return (
    <aside className="activity-bar" aria-label="Barra de actividad">
      <button
        className={`activity-bar-button ${activeSidebar === "explorer" && isSidebarVisible ? "active" : ""}`}
        onClick={() => onSelectSidebar("explorer")}
        title="Explorer"
        aria-label="Explorer"
      >
        <span aria-hidden="true">📂</span>
      </button>

      <button
        className={`activity-bar-button ${activeSidebar === "search" && isSidebarVisible ? "active" : ""}`}
        onClick={() => onSelectSidebar("search")}
        title="Search"
        aria-label="Search"
      >
        <span aria-hidden="true">🔎</span>
      </button>

      <button
        className={`activity-bar-button ${activeSidebar === "tools" && isSidebarVisible ? "active" : ""}`}
        onClick={() => onSelectSidebar("tools")}
        title="Tools"
        aria-label="Tools"
      >
        <span aria-hidden="true">🧰</span>
      </button>
    </aside>
  );
}
