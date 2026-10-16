import { Link } from "react-router-dom";

/** The Hypest logo: the word in Anton capitals. White on photos/dark, ink on light pages. */
export function Wordmark({ tone }: { tone: "light" | "dark" }) {
  return (
    <Link to="/" className={`wordmark wordmark-${tone}`} aria-label="Hypest home">
      HYPEST
    </Link>
  );
}
