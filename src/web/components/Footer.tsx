import type { Hint } from "../keymap";

function keyForHint(keys: string): string {
  if (keys === "↵") return "Enter";
  if (keys === "↑↓←→") return "ArrowDown";
  if (keys === "tab") return "Tab";
  return keys;
}

export function Footer({ hints }: { hints: Hint[] }) {
  return (
    <div className="row footer-hints">
      {hints.map((hint) => (
        <button
          className="footer-hint"
          key={hint.keys + hint.label}
          type="button"
          aria-label={`${hint.keys} ${hint.label}`}
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", {
            key: keyForHint(hint.keys), bubbles: true, cancelable: true,
          }))}
        >
          <span className="alt">{hint.keys}</span><span className="dim">{` ${hint.label}`}</span>
        </button>
      ))}
    </div>
  );
}
