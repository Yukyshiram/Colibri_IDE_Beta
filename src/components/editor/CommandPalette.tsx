import { useEffect, useMemo, useState } from "react";
import type { CommandPaletteActionId } from "../../lib/command-palette";
import "./CommandPalette.css";

export type CommandPaletteItem = {
  id: CommandPaletteActionId;
  label: string;
  hint?: string;
  keywords: string[];
  disabled?: boolean;
};

type CommandPaletteProps = {
  isOpen: boolean;
  items: CommandPaletteItem[];
  onClose: () => void;
  onExecute: (id: CommandPaletteActionId) => void;
};

export default function CommandPalette({
  isOpen,
  items,
  onClose,
  onExecute,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      const labelMatch = item.label.toLowerCase().includes(q);
      const hintMatch = item.hint?.toLowerCase().includes(q) ?? false;
      const keywordMatch = item.keywords.some((k) => k.includes(q));
      return labelMatch || hintMatch || keywordMatch;
    });
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
        if (!selected || selected.disabled) return;
        event.preventDefault();
        onExecute(selected.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, filteredItems, isOpen, onClose, onExecute]);

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div className="command-palette-input-wrap">
          <span className="command-palette-prefix" aria-hidden="true">&gt;</span>
          <input
            className="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comando..."
            autoFocus
            spellCheck={false}
          />
        </div>

        <div className="command-palette-results">
          {filteredItems.length === 0 ? (
            <p className="command-palette-empty">No hay comandos</p>
          ) : (
            filteredItems.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={item.id}
                  className={`command-palette-item ${isActive ? "active" : ""} ${item.disabled ? "disabled" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    if (item.disabled) return;
                    onExecute(item.id);
                  }}
                  disabled={item.disabled}
                >
                  <span className="command-palette-label">{item.label}</span>
                  {item.hint && <span className="command-palette-hint">{item.hint}</span>}
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
