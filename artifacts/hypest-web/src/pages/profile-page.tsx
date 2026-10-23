import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  useCreateBillingPortal,
  useGetCurrentUser,
  useLogout,
  useUpdateCurrentUser,
  type CurrentUser,
} from "@workspace/api-client-react";
import { errorStatus, serverErrorText } from "@/lib/server-error";
import { Offers, returnUrl } from "@/components/offers";
import { AccountActions } from "@/components/account-actions";
import { useAppConfig } from "@/lib/config";
import { useTraining } from "@/lib/coaching";
import { UnitsToggle } from "@/components/units-toggle";

const LEVEL_NAME: Record<string, string> = { none: "No plan yet", plan: "One-off plan", tier1: "Plans", tier2: "Coaching" };

function Membership() {
  const training = useTraining();
  const config = useAppConfig();
  const portal = useCreateBillingPortal({ request: { credentials: "include" } });
  const [portalError, setPortalError] = useState<string | null>(null);
  const access = training.data?.access;
  if (!access) return null;
  const subscribed = access.level === "tier1" || access.level === "tier2";

  async function manage() {
    setPortalError(null);
    try {
      const { url } = await portal.mutateAsync({ data: { return_url: returnUrl() } });
      window.location.assign(url);
    } catch (err) {
      setPortalError(serverErrorText(err));
    }
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <h2 className="section-title" style={{ margin: 0 }}>Membership</h2>
      <div className="card best-lift">
        <span>{LEVEL_NAME[access.level] ?? access.level}</span>
        <span className="label">{access.plan_credits > 0 ? `${access.plan_credits} plan${access.plan_credits === 1 ? "" : "s"} ready` : ""}</span>
      </div>
      {subscribed && config && config.payments !== "off" ? (
        <button type="button" className="secondary-button" onClick={manage} disabled={portal.isPending}>Manage membership</button>
      ) : null}
      {portalError ? <p className="error-text" role="alert">{portalError}</p> : null}
      <UnitsToggle />
      {access.level !== "tier2" ? <Offers access={access} /> : null}
    </section>
  );
}

const request = { credentials: "include" as const };

function isCurrentUser(value: unknown): value is CurrentUser {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    "email" in value &&
    typeof value.email === "string" &&
    "display_name" in value &&
    typeof value.display_name === "string"
  );
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
    request,
  });
  const logout = useLogout({ request });
  const updateProfile = useUpdateCurrentUser({ request });
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onLogout() {
    setError(null);
    try {
      await logout.mutateAsync();
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      navigate("/");
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  function startEditing() {
    if (!me.data) {
      return;
    }
    setDisplayName(me.data.display_name);
    setBio(me.data.bio ?? "");
    setError(null);
    setEditing(true);
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await updateProfile.mutateAsync({
        data: {
          display_name: displayName,
          bio: bio === "" ? null : bio,
        },
      });
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    } catch (err) {
      setError(serverErrorText(err));
    }
  }

  const user = isCurrentUser(me.data) ? me.data : null;
  const loggedOut = me.isError && errorStatus(me.error) === 401;
  const failed = !me.isPending && !user && !loggedOut;

  return (
    <main className="screen-scroll">
      <h1 className="screen-title">Me</h1>
      {me.isPending ? <p className="screen-copy">Loading</p> : null}
      {failed ? (
        <p className="error-text" role="alert">
          {me.isError ? serverErrorText(me.error) : "Request failed"}
        </p>
      ) : null}
      {loggedOut ? (
        <div className="button-row">
          <Link className="primary-button" to="/login">
            Log in
          </Link>
          <Link className="secondary-button" to="/signup">
            Sign up
          </Link>
        </div>
      ) : null}
      {user && !editing ? (
        <div className="profile-details">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span className="avatar" style={{ width: "3.5rem", height: "3.5rem", fontSize: "1.5rem" }} aria-hidden="true">
              {user.display_name.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span>
              <span className="profile-name" style={{ display: "block" }}>{user.display_name}</span>
              <span className="screen-copy" style={{ fontSize: "var(--size-small)" }}>{user.email}</span>
            </span>
          </div>
          {user.bio ? <p className="screen-copy">{user.bio}</p> : null}
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={startEditing}>
              Edit profile
            </button>
            <button className="secondary-button" type="button" onClick={onLogout} disabled={logout.isPending}>
              Log out
            </button>
          </div>
        </div>
      ) : null}
      {user && !editing ? <Membership /> : null}
      {user && !editing ? <AccountActions /> : null}
      {user && editing ? (
        <form className="account-form" onSubmit={onSave}>
          <label className="field">
            <span className="field-label">Display name</span>
            <input
              className="text-input"
              type="text"
              name="display_name"
              minLength={1}
              maxLength={60}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Bio</span>
            <textarea
              className="text-input"
              name="bio"
              maxLength={500}
              rows={4}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}
          <div className="button-row">
            <button className="primary-button" type="submit" disabled={updateProfile.isPending}>
              Save
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {error && !editing ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
