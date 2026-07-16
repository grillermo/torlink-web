import { useEffect, useRef, useState } from "react";
import { formatTrackers, parseTrackers } from "../../config/trackers";
import { ICON } from "../../ui/theme";

interface TrackersPromptProps {
  width: number;
  value: string[];
  onSubmit: (trackers: string[]) => void;
  onCancel: () => void;
}

export function TrackersPrompt({ width, value, onSubmit, onCancel }: TrackersPromptProps) {
  const [text, setText] = useState(() => formatTrackers(value));
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
    <section className="col prompt-modal" role="dialog" aria-label="extra trackers" style={{ width: `min(${width}ch, 100%)` }}>
      <strong className="accent">extra trackers</strong>
      <div className="prompt-body"><span className="accent" aria-hidden="true">{`${ICON.pointer} `}</span><input
        className="prompt-input"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit(parseTrackers(text));
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="udp://tracker.example:1337/announce, https://..."
        ref={inputRef}
        value={text}
      /></div>
      <p className="dim prompt-hints">↵ save     {ICON.dot}     esc cancel</p>
      <p className="dim prompt-notice">Separate with commas or spaces. Empty saves an empty list. Applies to new adds.</p>
    </section>
  );
}
