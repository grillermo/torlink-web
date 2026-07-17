import { HELP_GROUPS } from "../keymap";

export function HelpOverlay({ onClose }: { onClose(): void }) {
  return (
    <section className="col help-overlay" role="dialog" aria-label="Keyboard">
      <strong className="accent">Keyboard</strong>
      <div className="help-groups">
        {HELP_GROUPS.map((group) => (
          <section className="col help-group" key={group.title}>
            <strong>{group.title}</strong>
            {group.hints.map((hint) => <div className="help-hint" key={`${hint.keys}-${hint.label}`}><span className="alt">{hint.keys}</span><span className="dim">{hint.label}</span></div>)}
          </section>
        ))}
      </div>
      <p className="dim prompt-notice">Your downloaded files always stay on disk.<br /><span className="kb-only">Press ? or esc to close</span></p>
      <div className="prompt-actions">
        <button className="ghost-button" onClick={onClose} type="button">close</button>
      </div>
    </section>
  );
}
