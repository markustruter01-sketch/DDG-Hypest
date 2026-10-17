import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
const img = (name: string) => `${import.meta.env.BASE_URL}img/${name}`;

/** Greeting by Brisbane time (UTC+10, no daylight saving). */
function greeting(now = new Date()): string {
  const hour = (now.getUTCHours() + 10) % 24;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** Counts up from 0 to the real value once, unless the person prefers reduced motion. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / 900, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function Stat({ value, label, money = false }: { value: number; label: string; money?: boolean }) {
  const shown = useCountUp(value);
  return (
    <div>
      <span className="big-number">{money ? formatUsd(shown).replace(/\.\d\d$/, "") : shown}</span>
      <span className="label">{label}</span>
    </div>
  );
}

/** Signed-in Home for everyone, buyer or creator. A hero page: photos, big type, few words. */
export function Dashboard({ user }: { user: CurrentUser }) {
  const home = useGetHome({ query: { queryKey: getGetHomeQueryKey(), retry: false } });
  const mine = useListMyPrograms({ query: { queryKey: getListMyProgramsQueryKey(), retry: false }, request });
  const library = useListLibrary({ query: { queryKey: getListLibraryQueryKey(), retry: false }, request });
  const quote = quoteOfTheDay();
  const show = home.data;
  const myCount = Array.isArray(mine.data) ? mine.data.length : null;
  const ownedCount = Array.isArray(library.data) ? library.data.length : null;
  const firstName = user.display_name.trim().split(/\s+/)[0] ?? "";

  const tiles = [
    { to: "/studio", word: "Studio", meta: myCount === null ? "Sell" : `${myCount} ${myCount === 1 ? "program" : "programs"}`, photo: "strength.jpg" },
    { to: "/library", word: "Train", meta: ownedCount === null ? "Library" : `${ownedCount} owned`, photo: "run.jpg" },
    { to: "/explore", word: "Explore", meta: show ? `${show.live_programs} live` : "Find", photo: "yoga.jpg" },
    { to: "/profile", word: "Me", meta: user.handle ? `@${user.handle}` : "Profile", photo: null },
  ];

  return (
    <main className="home">
      <section className="home-hero">
        <img className="home-hero-photo" src={img("welcome.jpg")} alt="" aria-hidden="true" />
        <div className="home-hero-inner">
          <div className="page-header">
            <Wordmark tone="light" />
            <Link to="/profile" className="avatar avatar-light" aria-label="Your profile">
              {firstName.charAt(0).toUpperCase() || "?"}
            </Link>
          </div>
          <span className="label home-greeting rise" style={{ animationDelay: "60ms" }}>
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </span>
          <blockquote className="home-quote rise" style={{ animationDelay: "140ms" }}>{quote.text}</blockquote>
          <span className="home-quote-by rise" style={{ animationDelay: "220ms" }}>{quote.by}</span>
          {show ? (
            <div className="home-stats rise" style={{ animationDelay: "300ms" }}>
              <Stat value={show.creators} label="Creators" />
              <Stat value={show.live_programs} label="Programs" />
              {show.paid_out_cents !== null ? <Stat value={show.paid_out_cents} label="Paid out" money /> : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="home-body">
        {show && show.top_creators.length > 0 ? (
          <>
            <h2 className="section-title" style={{ margin: 0 }}>{show.ranking === "sales" ? "Top creators" : "New creators"}</h2>
            <div className="tile-row">
              {show.top_creators.map((c, i) => (
                <Link key={c.handle} className="creator-card" to={`/@${c.handle}`}>
                  <span className="creator-card-letter" aria-hidden="true">{c.display_name.trim().charAt(0).toUpperCase() || "?"}</span>
                  {show.ranking === "sales" ? <span className="creator-card-rank">#{i + 1}</span> : null}
                  <span className="creator-card-text">
                    <span className="tile-title" style={{ display: "block" }}>{c.display_name}</span>
                    <span className="tile-meta">
                      {show.ranking === "sales" ? `${c.sales} sold` : `${c.live_programs} ${c.live_programs === 1 ? "program" : "programs"}`}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : null}

        <div className="cockpit">
          {tiles.map((t) => (
            <Link
              key={t.to}
              className={t.photo ? "cockpit-tile" : "cockpit-tile cockpit-tile-solid"}
              to={t.to}
              style={t.photo ? { backgroundImage: `linear-gradient(rgb(14 14 14 / 10%), rgb(14 14 14 / 80%)), url("${img(t.photo)}")` } : undefined}
            >
              <span className="cockpit-word">{t.word}</span>
              <span className="tile-meta">{t.meta}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
