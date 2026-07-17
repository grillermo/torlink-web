import type { CSSProperties, ReactNode } from "react";

interface PanelProps {
  title: string;
  width: number;
  focused?: boolean;
  count?: string;
  height?: number;
  children: ReactNode;
}

export function Panel({ title, width, focused, count, height, children }: PanelProps) {
  const w = Math.max(10, width);
  const cap = title.charAt(0).toUpperCase() + title.slice(1);
  const label = count ? `${cap} ${count}` : cap;
  const fill = Math.max(0, w - 5 - label.length);

  // Sizing goes through custom properties, not width/height directly, so the
  // stylesheet can drop the fixed ch/lh box on narrow screens without fighting
  // an inline style.
  return (
    <section
      className={`col panel ${focused ? "focused" : ""}`}
      style={{ "--panel-width": `${w}ch`, ...(height ? { "--panel-height": `${height}lh` } : {}) } as CSSProperties}
    >
      <div className="panel-title"><span>╭─ </span><strong>{label}</strong><span>{` ${"─".repeat(fill)}╮`}</span></div>
      <div className="col panel-body px">{children}</div>
    </section>
  );
}
