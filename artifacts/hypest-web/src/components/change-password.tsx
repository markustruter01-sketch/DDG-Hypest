import { FormEvent, useState } from "react";
import { useChangePassword } from "@workspace/api-client-react";
import { serverErrorText } from "@/lib/server-error";

/** Me page: change password (other devices are logged out). */
export function ChangePassword() {
  const change = useChangePassword({ request: { credentials: "include" } });
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await change.mutateAsync({ data: { current_password: current, new_password: next } });
      setDone(true);
      setOpen(false);
      setCurrent("");
      setNext("");
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  if (!open) {
    return (
      <>
        <button className="text-link" type="button" onClick={() => { setOpen(true); setDone(false); }}>Change password</button>
        {done ? <p className="label" role="status">Password changed. Other devices are logged out.</p> : null}
      </>
    );
  }
  return (
    <form className="card account-form change-password" onSubmit={onSubmit}>
      <label className="field">
        <span className="field-label">Current password</span>
        <input className="text-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">New password (10+ characters)</span>
        <input className="text-input" type="password" autoComplete="new-password" minLength={10} maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <div className="button-row">
        <button className="primary-button" type="submit" disabled={change.isPending}>Save</button>
        <button className="secondary-button" type="button" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
      </div>
    </form>
  );
}
