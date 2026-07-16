import { useEffect, useRef, useState } from "react";
import { ICON } from "../theme";
import { useStore } from "../store";
import { Panel } from "./Panel";

export interface SearchBarProps {
  width: number;
  value: string;
  placeholder?: string;
  editing: boolean;
  onSubmit: (value: string) => void;
  onChange?: (value: string) => void;
  onExitDown?: () => void;
  onExitLeft?: () => void;
}

export function SearchBar({
  width,
  value,
  placeholder = "Search torrents…",
  editing,
  onSubmit,
  onChange,
  onExitDown,
  onExitLeft,
}: SearchBarProps) {
  const { setCaptureMode } = useStore();
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    return () => setCaptureMode("none");
  }, [editing, setCaptureMode]);

  return (
    <Panel title="search" width={width} focused={editing} height={2}>
      <div className="row search-row">
        <span className="accent" aria-hidden="true">{`${ICON.pointer} `}</span>
        {editing ? (
          <input
            aria-label={placeholder}
            className="search-input"
            onBlur={() => setCaptureMode("none")}
            onChange={(event) => {
              setText(event.target.value);
              onChange?.(event.target.value);
            }}
            onFocus={() => setCaptureMode("text")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit(text);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.blur();
                setCaptureMode("none");
                onExitDown?.();
              } else if (event.key === "ArrowDown") {
                onExitDown?.();
              } else if (
                event.key === "ArrowLeft" &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                !event.shiftKey &&
                event.currentTarget.selectionStart === 0 &&
                event.currentTarget.selectionEnd === 0
              ) {
                onExitLeft?.();
              }
            }}
            placeholder={placeholder}
            ref={inputRef}
            type="text"
            value={text}
          />
        ) : text ? <span className="trunc">{text}</span> : <span className="dim trunc">{placeholder}</span>}
      </div>
    </Panel>
  );
}
