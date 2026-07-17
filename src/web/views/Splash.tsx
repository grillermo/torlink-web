import { sourcesByGroup } from "../../sources/registry";
import { ICON } from "../theme";
import { Logo } from "../components/Logo";
import { SearchBar } from "../components/SearchBar";
import { useStore } from "../store";

const CATEGORIES = sourcesByGroup().map((group) => group.group.toLowerCase()).join(`  ${ICON.dot}  `);

export function Splash() {
  const { submitQuery } = useStore();

  return (
    <section className="col splash-content">
      <Logo />
      <p className="splash-description">A curated, local web app for torrent downloads.</p>
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
      <div className="splash-browse">
        <button className="ghost-button" onClick={() => submitQuery("")} type="button">browse everything</button>
      </div>
      <p className="splash-footer kb-only">
        <span className="alt">↵</span><span className="dim"> search</span>
        <span className="dim">{`  ${ICON.dot}  empty `}</span><span className="alt">↵</span><span className="dim"> browse</span>
      </p>
    </section>
  );
}
