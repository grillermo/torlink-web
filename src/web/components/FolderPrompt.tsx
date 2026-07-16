import { useEffect, useRef, useState } from "react";
import { ICON } from "../../ui/theme";

interface FolderPromptProps {
  width: number;
  dirs: string[];
  active: string;
  onActivate: (dir: string) => void;
  onAdd: (raw: string) => void;
  onRemove: (dir: string) => void;
  onCancel: () => void;
}

export function FolderPrompt({ width, dirs, active, onActivate, onAdd, onRemove, onCancel }: FolderPromptProps) {
  const addRow = dirs.length;
  const [cursor, setCursor] = useState(() => Math.max(0, dirs.indexOf(active)));
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCursor((current) => Math.min(current, dirs.length));
  }, [dirs.length]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const tagName = (event.target as { tagName?: string } | null)?.tagName?.toLowerCase();
      if (tagName === "input" || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        setCursor((current) => Math.max(0, current - 1));
      } else if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        setCursor((current) => Math.min(addRow, current + 1));
      } else if (event.key === "a") {
        event.preventDefault();
        setCursor(addRow);
        setAdding(true);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (cursor === addRow) setAdding(true);
        else if (dirs[cursor]) onActivate(dirs[cursor]);
      } else if ((event.key === "Delete" || event.key === "d") && cursor < addRow && dirs[cursor]) {
        event.preventDefault();
        onRemove(dirs[cursor]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addRow, cursor, dirs, onActivate, onCancel, onRemove]);

  return (
    <section className="col prompt-modal" role="dialog" aria-label="download folder" style={{ width: `min(${width}ch, 100%)` }}>
      <strong className="accent">download folder</strong>
      <div className="col prompt-body">
        {dirs.map((dir, index) => (
          <div className={index === cursor && !adding ? "accent" : ""} key={dir}>
            {index === cursor && !adding ? `${ICON.pointer} ` : "  "}{dir}{dir === active ? <span className="good"> {ICON.done}</span> : null}
          </div>
        ))}
        <div className={cursor === addRow && !adding ? "accent" : ""}>
          {cursor === addRow && !adding ? `${ICON.pointer} ` : "  "}
          {adding ? <input
            aria-label="Add download folder"
            className="prompt-input"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setAdding(false);
                onAdd(value);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setAdding(false);
              }
            }}
            placeholder="~/Downloads/torlink"
            ref={inputRef}
            value={value}
          /> : <span className="dim">+ add new folder…</span>}
        </div>
      </div>
      <p className="dim prompt-hints">↵ use   {ICON.dot}   a add   {ICON.dot}   d remove   {ICON.dot}   esc cancel</p>
    </section>
  );
}
