import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentUserQueryKey, useLogin } from "@workspace/api-client-react";
import { serverErrorText } from "@/lib/server-error";

const request = { credentials: "include" as const };

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const login = useLogin({ request });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await login.mutateAsync({
        data: { email, password },
      });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      navigate("/");
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Log in</h1>
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
            autoComplete="current-password"
            maxLength={200}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary-button" type="submit" disabled={login.isPending}>
          Log in
        </button>
        <Link className="text-link" to="/signup">
          Sign up
        </Link>
      </form>
    </main>
  );
}
