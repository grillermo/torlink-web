import { CATEGORIES, useStore } from "../store";

/** The side rail's category group, restated as chips for touch. Mobile only. */
export function FilterChips() {
  const { section, setSection, setRegion } = useStore();

  return (
    <div className="filter-chips" role="group" aria-label="Categories">
      {CATEGORIES.map((category) => {
        const selected = category.key === section;
        return (
          <button
            aria-pressed={selected}
            className={`chip${selected ? " selected" : ""}`}
            key={category.key}
            onClick={() => {
              setSection(category.key);
              setRegion("content");
            }}
            type="button"
          >
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
