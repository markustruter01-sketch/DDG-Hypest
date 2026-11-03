import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentUserQueryKey, useSignup } from "@workspace/api-client-react";
import { serverErrorText } from "@/lib/server-error";
import { afterAuth } from "@/lib/pending";
import { browserTimezone } from "@/lib/time";

const request = { credentials: "include" as const };

export function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const signup = useSignup({ request });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!adultConfirmed) {
      return;
    }

    try {
      await signup.mutateAsync({
        data: {
          email,
          password,
          display_name: displayName,
          adult_confirmed: true,
          timezone: browserTimezone(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      await afterAuth(location.search);
      navigate("/");
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Sign up</h1>
      <form className="account-form" onSubmit={onSubmit}>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="text-input"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="text-input"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={200}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Display name</span>
          <input
            className="text-input"
            type="text"
            name="display_name"
            autoComplete="nickname"
            minLength={1}
            maxLength={60}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="adult_confirmed"
            checked={adultConfirmed}
            onChange={(event) => setAdultConfirmed(event.target.checked)}
            required
          />
          <span>I confirm I am 18 or older</span>
        </label>
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        <p className="label legal-agree">
          By signing up you agree to the <Link to="/terms">Terms</Link>, <Link to="/privacy">Privacy policy</Link> and <Link to="/health">Health and safety</Link>.
        </p>
        <button className="primary-button" type="submit" disabled={signup.isPending}>
          Sign up
        </button>
        <Link className="text-link" to={`/login${location.search}`}>
          Log in
        </Link>
      </form>
    </main>
  );
}
