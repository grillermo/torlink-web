import { useEffect, useRef, useState } from "react";
import { ICON } from "../theme";

export type ThrottleDirection = "download" | "upload";

interface ThrottlePromptProps {
  width: number;
  direction: ThrottleDirection;
  value: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function ThrottlePrompt({ width, direction, value, onSubmit, onCancel }: ThrottlePromptProps) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      const tagName = (event.target as { tagName?: string } | null)?.tagName?.toLowerCase();
      if (tagName === "input" || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <section className="col prompt-modal" role="dialog" aria-label={`${direction} throttle`} style={{ width: `min(${width}ch, 100%)` }}>
      <strong className="accent">{direction} throttle</strong>
      <div className="prompt-body"><span className="accent" aria-hidden="true">{`${ICON.pointer} `}</span><input
        className="prompt-input"
        inputMode="numeric"
        onChange={(event) => setText(event.target.value.replace(/\D/g, ""))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit(text);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="unlimited"
        ref={inputRef}
        type="text"
        value={text}
      /><span className="dim"> KB/s</span></div>
      <p className="dim prompt-hints kb-only">↵ save     {ICON.dot}     esc cancel</p>
      <p className="dim prompt-notice">0 = unlimited</p>
      <div className="prompt-actions">
        <button className="ghost-button" onClick={() => onSubmit(text)} type="button">save</button>
        <button className="ghost-button" onClick={onCancel} type="button">cancel</button>
      </div>
    </section>
  );
}
