import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentUserQueryKey, useForgotPassword, useResetPassword } from "@workspace/api-client-react";
import { useAppConfig } from "@/lib/config";
import { serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

/** Ask for a reset link by email. */
export function ForgotPasswordPage() {
  const config = useAppConfig();
  const forgot = useForgotPassword({ request });
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      setSent((await forgot.mutateAsync({ data: { email } })).message);
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Reset password</h1>
      {config && !config.email ? (
        <p className="screen-copy">Email <a className="text-link" href={`mailto:${config.support_email}`}>{config.support_email}</a> from your account's email address and we'll help you back in.</p>
      ) : sent ? (
        <p className="screen-copy" role="status">{sent}</p>
      ) : (
        <form className="account-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input className="text-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={forgot.isPending}>Email me a link</button>
        </form>
      )}
      <Link className="text-link" to="/login">Back to log in</Link>
    </main>
  );
}

/** The page a reset email links to: /reset?token=… */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reset = useResetPassword({ request });
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await reset.mutateAsync({ data: { token, password } });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      navigate("/", { replace: true });
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">New password</h1>
      <form className="account-form" onSubmit={onSubmit}>
        <label className="field">
          <span className="field-label">New password (10+ characters)</span>
          <input className="text-input" type="password" autoComplete="new-password" minLength={10} maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={reset.isPending || !token}>Save and log in</button>
      </form>
      <Link className="text-link" to="/forgot">Need a new link?</Link>
    </main>
  );
}
