import { type CSSProperties, useEffect } from "react";
import { CATEGORIES, type Section, useStore } from "../store";
import { wrapStep } from "../../ui/move";
import { GUTTER, ICON } from "../../ui/theme";

interface NavItem {
  key: Section;
  label: string;
}

const FILTERS: NavItem[] = CATEGORIES.map((category) => ({
  key: category.key,
  label: category.label,
}));
const LIBRARY: NavItem[] = [
  { key: "downloads", label: "Downloads" },
  { key: "seeding", label: "Seeding" },
];
const GROUPS = [FILTERS, LIBRARY];
const NAV = GROUPS.flat();
const BADGE_WIDTH = " (00)".length;

export const RAIL_WIDTH = GUTTER + Math.max(...NAV.map((item) =>
  item.label.length + (item.key === "downloads" || item.key === "seeding" ? BADGE_WIDTH : 0),
));

export function Sidebar() {
  const { state, section, setSection, region, setRegion } = useStore();
  const focused = region === "sidebar";
  const index = Math.max(0, NAV.findIndex((item) => item.key === section));
  const downloading = state.queue.filter((item) => item.status === "downloading").length;
  const seeding = state.seeds.filter((item) => item.status === "seeding").length;

  function select(next: Section): void {
    setSection(next);
    setRegion("content");
  }

  function countFor(item: NavItem): number {
    if (item.key === "downloads") return downloading;
    if (item.key === "seeding") return seeding;
    return 0;
  }

  useEffect(() => {
    if (!focused) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      let next: Section | null = null;
      if (event.key === "ArrowUp" || event.key === "k") next = NAV[wrapStep(index, -1, NAV.length)]!.key;
      else if (event.key === "ArrowDown" || event.key === "j") next = NAV[wrapStep(index, 1, NAV.length)]!.key;
      else if (event.key === "Enter") {
        event.preventDefault();
        setRegion("content");
        return;
      }
      if (next) {
        event.preventDefault();
        setSection(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focused, index, setRegion, setSection]);

  return (
    <nav
      className={`col sidebar${focused ? " focused" : ""}`}
      aria-label="Sections"
      style={{ "--sidebar-width": `${RAIL_WIDTH}ch` } as CSSProperties}
    >
      {GROUPS.map((items, groupIndex) => (
        <div className="col sidebar-group" key={groupIndex}>
          {items.map((item) => {
            const selected = item.key === section;
            const count = countFor(item);
            return (
              <button
                aria-current={selected ? "page" : undefined}
                aria-label={item.label}
                className={`sidebar-button${selected ? " selected" : ""}`}
                key={item.key}
                onClick={() => select(item.key)}
                type="button"
              >
                <span
                  className={`sidebar-marker${selected ? " sidebar-marker-selected" : ""}${selected && focused ? " sidebar-marker-selected-focused" : ""}`}
                  aria-hidden="true"
                >
                  {selected ? ICON.bar : ""}
                </span>
                <span>{item.label}</span>
                {count > 0 ? <span className="dim sidebar-badge">{` (${count})`}</span> : null}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
