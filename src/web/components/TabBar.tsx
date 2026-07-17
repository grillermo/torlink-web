import { CATEGORIES, useStore, type Section } from "../store";

export type Tab = Section | "settings";

interface TabItem {
  key: Tab;
  label: string;
  glyph: string;
}

const TABS: TabItem[] = [
  { key: "all", label: "Browse", glyph: "⌕" },
  { key: "downloads", label: "Downloads", glyph: "↓" },
  { key: "seeding", label: "Seeding", glyph: "↑" },
  { key: "settings", label: "Settings", glyph: "⚙" },
];

const CATEGORY_KEYS = new Set<string>(CATEGORIES.map((category) => category.key));

/** Browse stays lit for every category, since the chip row lives inside it. */
function activeTab(section: Section, settingsOpen: boolean): Tab {
  if (settingsOpen) return "settings";
  return CATEGORY_KEYS.has(section) ? "all" : section;
}

export function TabBar({
  settingsOpen,
  onOpenSettings,
}: {
  settingsOpen: boolean;
  onOpenSettings(): void;
}) {
  const { section, setSection, setRegion } = useStore();
  const active = activeTab(section, settingsOpen);

  function select(tab: Tab): void {
    if (tab === "settings") {
      onOpenSettings();
      return;
    }
    setSection(tab);
    setRegion("content");
  }

  return (
    <nav aria-label="Sections" className="tab-bar">
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            aria-current={selected ? "page" : undefined}
            className={`tab-button${selected ? " selected" : ""}`}
            key={tab.key}
            onClick={() => select(tab.key)}
            type="button"
          >
            <span aria-hidden="true" className="tab-glyph">{tab.glyph}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
