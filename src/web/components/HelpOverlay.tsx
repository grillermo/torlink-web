import { HELP_GROUPS } from "../../ui/keymap";

export function HelpOverlay() {
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
      <p className="dim prompt-notice">Your downloaded files always stay on disk.<br />Press ? or esc to close</p>
    </section>
  );
}
