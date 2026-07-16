import type { ReactNode } from "react";

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

  return (
    <section
      className={`col panel ${focused ? "focused" : ""}`}
      style={{ width: `${w}ch`, ...(height ? { height: `${height}lh` } : {}) }}
    >
      <div className="panel-title"><span>╭─ </span><strong>{label}</strong><span>{` ${"─".repeat(fill)}╮`}</span></div>
      <div className="col panel-body px">{children}</div>
    </section>
  );
}
