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
    { to: "/studio", word: "Studio", meta: myCount === null ? "Sell" : `${myCount} ${myCount === 1 ? "program" : "programs"}`, photo: "strength.webp" },
    { to: "/library", word: "Train", meta: ownedCount === null ? "Library" : `${ownedCount} owned`, photo: "run.webp" },
    { to: "/explore", word: "Explore", meta: show ? `${show.live_programs} live` : "Find", photo: "yoga.webp" },
    { to: "/profile", word: "Me", meta: user.handle ? `@${user.handle}` : "Profile", photo: null },
  ];

  return (
    <main className="home">
      <section className="home-hero">
        <img className="home-hero-photo" src={img("welcome.webp")} alt="" aria-hidden="true" />
        <div className="home-hero-top page-header">
          <Wordmark tone="light" />
          <Link to="/profile" className="avatar avatar-light" aria-label="Your profile">
            {firstName.charAt(0).toUpperCase() || "?"}
          </Link>
        </div>
      </section>

      <section className="home-copy">
        <span className="label rise" style={{ animationDelay: "60ms" }}>
          {greeting()}{firstName ? `, ${firstName}` : ""}
        </span>
        <blockquote className="home-quote rise" style={{ animationDelay: "140ms" }}>{quote.text}</blockquote>
        <span className="home-quote-by rise" style={{ animationDelay: "220ms" }}>{quote.by}</span>
      </section>

      <section className="home-strip rise" style={{ animationDelay: "300ms" }}>
        {show ? (
          <>
            <Stat value={show.creators} label="Creators" />
            <Stat value={show.live_programs} label="Programs" />
            {show.paid_out_cents !== null ? <Stat value={show.paid_out_cents} label="Paid out" money /> : null}
          </>
        ) : null}
        {show && show.top_creators.length > 0 ? (
          <div className="home-faces" aria-label={show.ranking === "sales" ? "Top creators" : "New creators"}>
            {show.top_creators.slice(0, 4).map((c) => (
              <Link key={c.handle} to={`/@${c.handle}`} className="avatar" title={c.display_name} aria-label={c.display_name}>
                {c.display_name.trim().charAt(0).toUpperCase() || "?"}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <nav className="cockpit" aria-label="Main areas">
        {tiles.map((t) => (
          <Link
            key={t.to}
            className={t.photo ? "cockpit-tile" : "cockpit-tile cockpit-tile-solid"}
            to={t.to}
            style={t.photo ? { backgroundImage: `linear-gradient(rgb(14 14 14 / 5%), rgb(14 14 14 / 78%)), url("${img(t.photo)}")` } : undefined}
          >
            <span className="cockpit-word">{t.word}</span>
            <span className="tile-meta">{t.meta}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
