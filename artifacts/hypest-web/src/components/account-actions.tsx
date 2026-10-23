import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteAccount, useLogoutAll } from "@workspace/api-client-react";
import { serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

/** Me page: download my data, log out everywhere, delete account (password + one more tap). */
export function AccountActions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutAll = useLogoutAll({ request });
  const remove = useDeleteAccount({ request });
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function leave(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      queryClient.clear();
      navigate("/", { replace: true });
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  function onDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void leave(() => remove.mutateAsync({ data: { password } }));
  }

  return (
    <section className="account-actions">
      <h2 className="section-title" style={{ margin: 0 }}>Account</h2>
      <div className="button-row">
        <a className="secondary-button" href="/api/me/export" download="hypest-my-data.json">My data</a>
        <button className="secondary-button" type="button" onClick={() => leave(() => logoutAll.mutateAsync())} disabled={logoutAll.isPending}>
          Log out everywhere
        </button>
      </div>
      {confirming ? (
        <form className="card delete-account" onSubmit={onDelete}>
          <p className="delete-warning">Deletes your plans, logs and account. Any membership is cancelled. This can't be undone.</p>
          <label className="field">
            <span className="field-label">Password</span>
            <input className="text-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <div className="button-row">
            <button className="danger-button" type="submit" disabled={remove.isPending || !password}>Delete for good</button>
            <button className="secondary-button" type="button" onClick={() => { setConfirming(false); setPassword(""); setError(null); }}>Keep it</button>
          </div>
        </form>
      ) : (
        <button className="text-link delete-link" type="button" onClick={() => setConfirming(true)}>Delete account</button>
      )}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </section>
  );
}
