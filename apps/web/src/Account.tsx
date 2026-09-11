import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  post,
  useData,
  ErrorBox,
  PageHead,
  Download,
  when,
} from "./lib.js";
export function Account() {
  const { data, error, refresh } = useData("/api/usage");
  const sessions = useData("/api/auth/list-sessions");
  const [failure, setFailure] = useState<Error>();
  const [status, setStatus] = useState("");
  const nav = useNavigate();
  async function importFile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("file") as File;
    try {
      if (file.size > 8388608) throw new Error("Import exceeds 8 MiB.");
      const p = await post("/api/import", JSON.parse(await file.text()));
      nav(`/projects/${p.id}`);
    } catch (e) {
      setFailure(e as Error);
    }
  }
  return (
    <>
      <PageHead
        title="Your account"
        description="Manage access and take your work with you."
      />
      <ErrorBox error={error || failure} />
      <section className="panel">
        <h2>Import a project</h2>
        <p>
          Import a Cove JSON export into a new private project. Permissions and
          credentials are never imported.
        </p>
        <form onSubmit={importFile}>
          <label>
            Cove JSON file
            <input
              name="file"
              type="file"
              accept="application/json,.json"
              required
            />
          </label>
          <button>Import into new project</button>
        </form>
      </section>
      <section className="panel">
        <h2>Usage observations</h2>
        <p>
          Only event types and record identifiers are measured. Your project
          text is not included.
        </p>
        {data && (
          <>
            <dl className="usage">
              {data.observations.map((o: any) => (
                <div key={o.kind}>
                  <dt>{o.kind.replaceAll("_", " ")}</dt>
                  <dd>{o.count}</dd>
                </div>
              ))}
            </dl>
            <p>
              {Math.round(data.storageBytes / 1024)} KiB of saved document data
              · {Math.round(data.limits.MAX_STORAGE_BYTES / 1048576)} MiB limit
            </p>
            <p>{data.interpretation}</p>
            <Download url="/api/usage">Download metadata</Download>
            <button className="quiet" onClick={refresh}>
              Refresh
            </button>
          </>
        )}
      </section>
      <section className="panel">
        <h2>Signed-in sessions</h2>
        <ErrorBox error={sessions.error} />
        {sessions.data?.map((s: any) => (
          <div className="record" key={s.id}>
            <div>
              <p>{s.userAgent || "Browser session"}</p>
              <small>Expires {when(s.expiresAt)}</small>
            </div>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await post("/api/auth/revoke-session", { token: s.token });
                  sessions.refresh();
                  setStatus("Session revoked.");
                } catch (e) {
                  setFailure(e as Error);
                }
              }}
            >
              Revoke session
            </button>
          </div>
        ))}
        <button
          className="secondary"
          onClick={async () => {
            try {
              await post("/api/auth/revoke-other-sessions");
              sessions.refresh();
              setStatus("Other sessions revoked.");
            } catch (e) {
              setFailure(e as Error);
            }
          }}
        >
          Sign out other sessions
        </button>
        <p role="status">{status}</p>
      </section>
      <section className="panel danger">
        <h2>Delete your account permanently</h2>
        <p>
          This removes your projects, revisions, handoffs, activity, sessions,
          and assistant connections. Export anything you want to keep first.
          Backup copies expire according to the operator’s retention policy.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await api("/api/account", {
                method: "DELETE",
                body: JSON.stringify({
                  password: f.get("password"),
                  confirmation: f.get("confirmation"),
                }),
              });
              nav("/");
            } catch (e) {
              setFailure(e as Error);
            }
          }}
        >
          <label>
            Current password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            Type DELETE MY ACCOUNT
            <input name="confirmation" required pattern="DELETE MY ACCOUNT" />
          </label>
          <button className="danger-button">Delete account permanently</button>
        </form>
      </section>
    </>
  );
}
