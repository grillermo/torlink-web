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
  onActivate?: () => void;
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
  onActivate,
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

  // The input stays mounted even when not editing so a tap anywhere on the row
  // is a native focus gesture — mobile browsers only open the keyboard for those.
  return (
    <Panel title="search" width={width} focused={editing} height={2}>
      <div className="row search-row" onClick={() => inputRef.current?.focus()}>
        <span className="accent" aria-hidden="true">{`${ICON.pointer} `}</span>
        <input
          aria-label={placeholder}
          className="search-input"
          onBlur={() => setCaptureMode("none")}
          onChange={(event) => {
            setText(event.target.value);
            onChange?.(event.target.value);
          }}
          onFocus={() => {
            setCaptureMode("text");
            if (!editing) onActivate?.();
          }}
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
      </div>
    </Panel>
  );
}
