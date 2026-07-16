export function Rule({ width }: { width: number }) {
  return <div className="fg-rule" aria-hidden="true">{"─".repeat(Math.max(1, width))}</div>;
}
