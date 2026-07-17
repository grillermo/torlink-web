export interface RowAction {
  label: string;
  tone?: "bad";
  onPress(): void;
}

/**
 * Tap strip under the selected row — the touch route to that row's
 * keybindings. Renders everywhere; on desktop it doubles as a mouse target.
 */
export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  return (
    <div aria-label={label} className="row-actions" role="group">
      {actions.map((action) => (
        <button
          className={`ghost-button${action.tone ? ` ${action.tone}` : ""}`}
          key={action.label}
          onClick={action.onPress}
          type="button"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
