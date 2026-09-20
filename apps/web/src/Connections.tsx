import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useData,
  ErrorBox,
  Loading,
  PageHead,
  post,
  when,
  CopyButton,
} from "./lib.js";
export function Connections() {
  const { data, error, refresh } = useData("/api/connections");
  const [editing, setEditing] = useState<any>();
  const [actionError, setError] = useState<Error>();
  return (
    <>
      <PageHead
        title="Assistant connections"
        description="Choose which projects each assistant can read or update."
      />
      <section className="panel">
        <h2>Connect from your assistant</h2>
        <p>
          Add this remote MCP address in your assistant’s connection settings,
          then complete the sign-in and project-permission screen.
        </p>
        <code className="endpoint">
          {window.location.origin}
          {import.meta.env.VITE_COVE_SITES === "true" ? "/api/mcp" : "/mcp"}
        </code>
        <CopyButton
          text={`${window.location.origin}${import.meta.env.VITE_COVE_SITES === "true" ? "/api/mcp" : "/mcp"}`}
          label="Copy server address"
        />
        <p className="muted">
          A connection stays “Awaiting first interaction” until it makes a
          verified request. Assistant labels are chosen by you and do not verify
          a model provider.
        </p>
      </section>
      <ErrorBox error={error || actionError} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <div className="records">
            {!data.length && (
              <p className="empty">
                No assistants authorized yet. You can always create and copy
                handoffs manually.
              </p>
            )}
            {data.map((c: any) => (
              <article className="record" key={c.id}>
                <div>
                  <h2>{c.label}</h2>
                  <p>
                    {c.status === "revoked"
                      ? "Revoked"
                      : new Date(c.expires_at) <= new Date()
                        ? "Expired"
                        : c.status === "active"
                          ? "Verified interaction observed"
                          : "Awaiting first interaction"}
                  </p>
                  <small>
                    Expires {when(c.expires_at)}
                    {c.last_activity &&
                      ` · Last interaction ${when(c.last_activity)}`}
                  </small>
                  <p>{c.grants.length} project grant(s)</p>
                </div>
                {c.status !== "revoked" && (
                  <div className="actions">
                    <button className="secondary" onClick={() => setEditing(c)}>
                      Edit permissions
                    </button>
                    <button
                      className="quiet"
                      onClick={async () => {
                        if (
                          !confirm(
                            `Revoke ${c.label}? Subsequent requests will be denied. Copied text cannot be revoked.`,
                          )
                        )
                          return;
                        try {
                          await post(`/api/connections/${c.id}/revoke`);
                          refresh();
                        } catch (e) {
                          setError(e as Error);
                        }
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )
      )}
      {editing && (
        <GrantForm
          clientId={editing.client_id}
          initial={editing}
          onSaved={() => {
            setEditing(undefined);
            refresh();
          }}
          cancel={() => setEditing(undefined)}
        />
      )}
      <section className="panel">
        <h2>Save prompt</h2>
        <pre className="prompt">
          Read my selected Cove project’s full current context and version.
          Preserve existing useful context and stable entry IDs. Save the
          decisions, completed work, constraints, sources, and next steps from
          this conversation with expectedVersion and a fresh requestKey. If
          there is a conflict, inspect changes before retrying. Create a handoff
          pinned to the saved revision. Report the actual revision and handoff
          ID.
        </pre>
        <CopyButton text="Read my selected Cove project's full current context and version. Preserve existing useful context and stable entry IDs. Save the decisions, completed work, constraints, sources, and next steps from this conversation with expectedVersion and a fresh requestKey. If there is a conflict, inspect changes before retrying. Create a handoff pinned to the saved revision. Report the actual revision and handoff ID." />
      </section>
      <p className="muted">
        Cove does not access private conversations automatically. A connection
        does not guarantee tool use. Authorization lasts up to 90 days and can
        be revoked at any time.
      </p>
    </>
  );
}
export function Consent() {
  const [params] = useSearchParams();
  const query = params.get("oauth_query") || params.toString();
  const clientId =
    new URLSearchParams(query).get("client_id") ||
    params.get("client_id") ||
    "";
  const [error, setError] = useState<Error>();
  async function finish(accept: boolean) {
    try {
      const r = await post("/api/auth/oauth2/consent", {
        accept,
        oauth_query: query,
      });
      window.location.assign(r.url || r.redirect_uri);
    } catch (e) {
      setError(e as Error);
      void post("/api/connection-failure");
    }
  }
  return (
    <>
      <PageHead
        title="Authorize an assistant"
        description="Grant access only to the projects you choose."
      />
      <ErrorBox error={error} />
      {clientId ? (
        <>
          <p className="muted break">Requested client: {clientId}</p>
          <GrantForm
            clientId={clientId}
            onSaved={() => finish(true)}
            cancel={() => finish(false)}
          />
        </>
      ) : (
        <p role="alert">
          This authorization request is incomplete. Restart the connection from
          your assistant.
        </p>
      )}
    </>
  );
}
function GrantForm({
  clientId,
  initial,
  onSaved,
  cancel,
}: {
  clientId: string;
  initial?: any;
  onSaved: () => void;
  cancel: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const { data, error } = useData(`/api/projects?limit=50&offset=${offset}`);
  const [label, setLabel] = useState(initial?.label || "");
  const [days, setDays] = useState<number | undefined>(
    initial ? undefined : 30,
  );
  const [grants, setGrants] = useState<any[]>(initial?.grants || []);
  const [failure, setFailure] = useState<Error>();
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>{initial ? "Edit access" : "Choose access"}</h2>
      <ErrorBox error={error || failure} />
      <label>
        Assistant label
        <input
          maxLength={100}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="For example, my writing assistant"
        />
      </label>
      <label>
        Authorization duration
        <select
          value={days ?? "keep"}
          onChange={(e) =>
            setDays(
              e.target.value === "keep" ? undefined : Number(e.target.value),
            )
          }
        >
          {initial && (
            <option value="keep">
              Keep current expiration ({when(initial.expires_at)})
            </option>
          )}
          <option value={7}>7 days from now</option>
          <option value={30}>30 days from now</option>
          <option value={90}>90 days from now</option>
        </select>
      </label>
      {data?.items.map((p: any) => {
        const grant = grants.find((g) => g.projectId === p.id);
        return (
          <div className="grant" key={p.id}>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!!grant}
                onChange={(e) =>
                  setGrants((g) =>
                    e.target.checked
                      ? [...g, { projectId: p.id, capabilities: ["read"] }]
                      : g.filter((x) => x.projectId !== p.id),
                  )
                }
              />
              {p.name}
            </label>
            {grant && (
              <label>
                Permission
                <select
                  value={
                    grant.capabilities.includes("write")
                      ? "write"
                      : grant.capabilities.includes("handoff")
                        ? "handoff"
                        : "read"
                  }
                  onChange={(e) =>
                    setGrants((g) =>
                      g.map((x) =>
                        x.projectId === p.id
                          ? {
                              ...x,
                              capabilities:
                                e.target.value === "write"
                                  ? ["read", "write", "handoff"]
                                  : e.target.value === "handoff"
                                    ? ["read", "handoff"]
                                    : ["read"],
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="read">Read only</option>
                  <option value="handoff">Read and create handoffs</option>
                  <option value="write">
                    Read, update, and create handoffs
                  </option>
                </select>
              </label>
            )}
          </div>
        );
      })}
      {data && (
        <div className="actions">
          {offset > 0 && (
            <button
              className="quiet"
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous projects
            </button>
          )}
          {data.nextOffset !== null && (
            <button
              className="quiet"
              onClick={() => setOffset(data.nextOffset)}
            >
              More projects
            </button>
          )}
        </div>
      )}
      <p className="muted">
        Selected: {grants.length} project(s). The assistant cannot expand its
        own permissions. Text copied outside Cove cannot be revoked.
      </p>
      <div className="actions">
        <button
          disabled={!label.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await post("/api/connections", {
                clientId,
                label,
                grants,
                expiresInDays: days,
              });
              onSaved();
            } catch (e) {
              setFailure(e as Error);
              void post("/api/connection-failure");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Saving…"
            : initial
              ? "Save permissions"
              : "Authorize selected projects"}
        </button>
        <button className="secondary" onClick={cancel}>
          {initial ? "Cancel" : "Deny"}
        </button>
      </div>
    </section>
  );
}
