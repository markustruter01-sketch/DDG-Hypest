import { Link } from "react-router-dom";
import { BookOpen, Compass, LayoutGrid, UserRound } from "lucide-react";
import {
  getGetHomeQueryKey,
  getListLibraryQueryKey,
  getListMyProgramsQueryKey,
  useGetHome,
  useListLibrary,
  useListMyPrograms,
  type CurrentUser,
} from "@workspace/api-client-react";
import { Wordmark } from "@/components/wordmark";
import { formatUsd } from "@/lib/money";
import { quoteOfTheDay } from "@/lib/quotes";

const request = { credentials: "include" as const };
const quotePhoto = `${import.meta.env.BASE_URL}img/yoga.jpg`;

/** Signed-in Home for everyone, buyer or creator: brand, daily quote, showcase, cockpit buttons. */
export function Dashboard({ user }: { user: CurrentUser }) {
  const home = useGetHome({ query: { queryKey: getGetHomeQueryKey(), retry: false } });
  const mine = useListMyPrograms({ query: { queryKey: getListMyProgramsQueryKey(), retry: false }, request });
  const library = useListLibrary({ query: { queryKey: getListLibraryQueryKey(), retry: false }, request });
  const quote = quoteOfTheDay();
  const show = home.data;
  const myCount = Array.isArray(mine.data) ? mine.data.length : null;
  const ownedCount = Array.isArray(library.data) ? library.data.length : null;

  return (
    <main className="screen-scroll">
      <div className="page-header">
        <Wordmark tone="dark" />
        <Link to="/profile" className="avatar" aria-label="Your profile">
          {user.display_name.trim().charAt(0).toUpperCase() || "?"}
        </Link>
      </div>

      <figure className="quote-card" style={{ backgroundImage: `linear-gradient(rgb(14 14 14 / 35%), rgb(14 14 14 / 85%)), url("${quotePhoto}")` }}>
        <span className="label" style={{ color: "var(--color-on-dark-muted)" }}>Today</span>
        <blockquote>{quote.text}</blockquote>
        <figcaption>{quote.by}</figcaption>
      </figure>

      {show ? (
        <div className="stat-row" style={{ gridTemplateColumns: `repeat(${show.paid_out_cents === null ? 2 : 3}, minmax(0, 1fr))` }}>
          <div className="card stat"><span className="big-number">{show.creators}</span><span className="label">Creators</span></div>
          <div className="card stat"><span className="big-number">{show.live_programs}</span><span className="label">Programs</span></div>
          {show.paid_out_cents !== null ? (
            <div className="card stat"><span className="big-number" style={{ fontSize: "1.75rem" }}>{formatUsd(show.paid_out_cents).replace(/\.\d\d$/, "")}</span><span className="label">Paid to creators</span></div>
          ) : null}
        </div>
      ) : null}

      {show && show.top_creators.length > 0 ? (
        <>
          <h2 className="section-title" style={{ margin: 0 }}>{show.ranking === "sales" ? "Top creators" : "New creators"}</h2>
          <div className="tile-row">
            {show.top_creators.map((c, i) => (
              <Link key={c.handle} className="creator-chip" to={`/@${c.handle}`}>
                {show.ranking === "sales" ? <span className="rank">{i + 1}</span> : null}
                <span className="avatar" aria-hidden="true">{c.display_name.trim().charAt(0).toUpperCase() || "?"}</span>
                <span className="creator-chip-name">{c.display_name}</span>
                <span className="label">
                  {show.ranking === "sales" ? `${c.sales} sold` : `${c.live_programs} ${c.live_programs === 1 ? "program" : "programs"}`}
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      <div className="cockpit">
        <Link className="cockpit-btn" to="/studio">
          <LayoutGrid size={26} aria-hidden="true" />
          <span className="cockpit-word">Studio</span>
          <span className="label">{myCount === null ? "Sell" : `${myCount} ${myCount === 1 ? "program" : "programs"}`}</span>
        </Link>
        <Link className="cockpit-btn" to="/library">
          <BookOpen size={26} aria-hidden="true" />
          <span className="cockpit-word">Train</span>
          <span className="label">{ownedCount === null ? "Library" : `${ownedCount} owned`}</span>
        </Link>
        <Link className="cockpit-btn" to="/explore">
          <Compass size={26} aria-hidden="true" />
          <span className="cockpit-word">Explore</span>
          <span className="label">{show ? `${show.live_programs} live` : "Find"}</span>
        </Link>
        <Link className="cockpit-btn" to="/profile">
          <UserRound size={26} aria-hidden="true" />
          <span className="cockpit-word">Me</span>
          <span className="label">{user.handle ? `@${user.handle}` : "Profile"}</span>
        </Link>
      </div>
    </main>
  );
}
