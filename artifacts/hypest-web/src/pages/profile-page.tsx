import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  useGetCurrentUser,
  useLogout,
  useUpdateCurrentUser,
  type CurrentUser,
} from "@workspace/api-client-react";
import { errorStatus, serverErrorText } from "@/lib/server-error";

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
      <h1 className="screen-title">Profile</h1>
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
          <p className="profile-name">{user.display_name}</p>
          <p className="screen-copy">{user.email}</p>
          <p className="screen-copy">{user.bio ?? ""}</p>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={startEditing}>
              Edit profile
            </button>
            <button className="secondary-button" type="button" onClick={onLogout} disabled={logout.isPending}>
              Log out
            </button>
          </div>
        </div>
      ) : null}
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
