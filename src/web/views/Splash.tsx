import { sourcesByGroup } from "../../sources/registry";
import { ICON } from "../../ui/theme";
import { Logo } from "../components/Logo";
import { SearchBar } from "../components/SearchBar";
import { useStore } from "../store";

const CATEGORIES = sourcesByGroup().map((group) => group.group.toLowerCase()).join(`  ${ICON.dot}  `);

export function Splash() {
  const { quitAll, submitQuery } = useStore();

  return (
    <section
      className="col splash-content"
      onKeyDown={(event) => {
        if (event.key === "Escape" || (event.ctrlKey && event.key.toLowerCase() === "c")) {
          event.preventDefault();
          quitAll();
        }
      }}
    >
      <Logo />
      <p className="splash-description">A curated, terminal-native torrent downloader.</p>
      <p className="dim splash-categories">{CATEGORIES}</p>
      <div className="splash-search">
        <SearchBar
          editing
          onSubmit={submitQuery}
          placeholder="Search or paste a magnet link…"
          value=""
          width={62}
        />
      </div>
      <p className="splash-footer">
        <span className="alt">↵</span><span className="dim"> search</span>
        <span className="dim">{`  ${ICON.dot}  empty `}</span><span className="alt">↵</span><span className="dim"> browse</span>
        <span className="dim">{`  ${ICON.dot}  `}</span><span className="alt">^c</span><span className="dim"> quit</span>
      </p>
    </section>
  );
}
