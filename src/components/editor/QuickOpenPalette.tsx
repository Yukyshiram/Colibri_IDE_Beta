import { useEffect, useMemo, useState } from "react";
import { FileIcon } from "../../lib/file-icons";
import type { QuickOpenFileItem } from "../../lib/project-files";
import "./QuickOpenPalette.css";

type QuickOpenPaletteProps = {
  isOpen: boolean;
  items: QuickOpenFileItem[];
  onClose: () => void;
  onOpenItem: (item: QuickOpenFileItem) => void;
};

export default function QuickOpenPalette({
  isOpen,
  items,
  onClose,
  onOpenItem,
}: QuickOpenPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 200);

    const byName = items.filter((item) => item.name.toLowerCase().includes(q));
    const byPath = items.filter(
      (item) =>
        !byName.some((nameMatch) => nameMatch.path === item.path) &&
        item.relativePath.toLowerCase().includes(q)
    );

    return [...byName, ...byPath].slice(0, 200);
  }, [items, query]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setActiveIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const maxIndex = Math.max(0, filteredItems.length - 1);
    if (activeIndex > maxIndex) {
      setActiveIndex(maxIndex);
    }
  }, [activeIndex, filteredItems.length, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, Math.max(filteredItems.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        const selected = filteredItems[activeIndex];
        if (!selected) return;
        event.preventDefault();
        onOpenItem(selected);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, filteredItems, isOpen, onClose, onOpenItem]);

  if (!isOpen) return null;

  return (
    <div className="quick-open-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <section className="quick-open" role="dialog" aria-modal="true" aria-label="Quick Open">
        <div className="quick-open-input-wrap">
          <span className="quick-open-prefix" aria-hidden="true">{">"}</span>
          <input
            className="quick-open-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar archivo por nombre..."
            autoFocus
            spellCheck={false}
          />
        </div>

        <div className="quick-open-results">
          {filteredItems.length === 0 ? (
            <p className="quick-open-empty">No hay resultados</p>
          ) : (
            filteredItems.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={item.path}
                  className={`quick-open-item ${isActive ? "active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onOpenItem(item)}
                >
                  <FileIcon name={item.name} size={12} />
                  <span className="quick-open-name">{item.name}</span>
                  <span className="quick-open-path">{item.relativePath}</span>
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
