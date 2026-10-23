import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTurnOffReminders } from "@workspace/api-client-react";
import { request } from "@/lib/coaching";
import { serverErrorText } from "@/lib/server-error";

/** The "turn these off" link in a reminder email. A button (not automatic), so email link scanners can't trigger it. */
export function RemindersOffPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const off = useTurnOffReminders({ request });
  const [error, setError] = useState<string | null>(null);

  async function turnOff() {
    setError(null);
    try {
      await off.mutateAsync({ data: { token } });
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Reminder emails</h1>
      {off.isSuccess ? (
        <p className="screen-copy" role="status">Done. You won't get reminder emails. You can turn them back on in Me.</p>
      ) : (
        <>
          <p className="screen-copy">Stop the emails Hypest sends when you miss a few days?</p>
          <button type="button" className="primary-button" onClick={turnOff} disabled={!token || off.isPending}>Turn them off</button>
        </>
      )}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <Link className="text-link" to="/">Back to Hypest</Link>
    </main>
  );
}
