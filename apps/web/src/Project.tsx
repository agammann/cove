import { useState, useRef } from "react";
import { Link, NavLink, useParams, useNavigate } from "react-router-dom";
import {
  ArrowRightCircle,
  Clock,
  FileText,
  Link2,
  Pencil,
  Plus,
} from "lucide-react";
import { labels, type Context } from "../../../packages/shared/context.js";
import {
  useData,
  PageHead,
  ErrorBox,
  Loading,
  Empty,
  post,
  key,
  when,
  Compare,
  Download,
  CopyButton,
  api,
} from "./lib.js";
export function Project({
  tab = "overview",
}: {
  tab?: "overview" | "handoffs" | "history" | "activity" | "portability";
}) {
  const { id } = useParams();
  const { data, error, refresh } = useData(`/api/projects/${id}`);
  const [actionError, setError] = useState<Error>();
  const [publishing, setPublishing] = useState(false);
  const pendingHandoff = useRef<
    { projectId: string; version: number; key: string } | undefined
  >(undefined);
  const nav = useNavigate();
  if (!data)
    return (
      <>
        <ErrorBox error={error} />
        {!error && <Loading />}
      </>
    );
  const { project: p, revision: r } = data;
  const ctx = r.context as Context;
  async function handoff() {
    setPublishing(true);
    try {
      if (
        !pendingHandoff.current ||
        pendingHandoff.current.projectId !== id ||
        pendingHandoff.current.version !== p.version
      )
        pendingHandoff.current = {
          projectId: id!,
          version: p.version,
          key: key(),
        };
      const h = await post(`/api/projects/${id}/handoffs`, {
        expectedVersion: p.version,
        requestKey: pendingHandoff.current.key,
      });
      nav(`/projects/${id}/handoffs/${h.id}`);
    } catch (e) {
      setError(e as Error);
    } finally {
      setPublishing(false);
    }
  }
  return (
    <>
      <p className="breadcrumb">
        <Link to="/projects">Projects</Link> / {p.name}
      </p>
      <PageHead
        title={p.name}
        description={
          p.description || "A clear starting point for your next assistant."
        }
        actions={
          <>
            <Link className="button secondary" to={`/projects/${id}/edit`}>
              Update context
            </Link>
            <button disabled={publishing} onClick={handoff}>
              {publishing ? "Creating…" : "Create handoff"}
            </button>
          </>
        }
      />
      <nav className="tabs" aria-label="Project views">
        {[
          ["overview", "Overview", ""],
          ["handoffs", "Handoffs", "/handoffs"],
          ["history", "History", "/history"],
          ["activity", "Activity", "/activity"],
          ["portability", "Project settings", "/settings"],
        ].map(([t, label, path]) => (
          <NavLink
            key={t}
            className={tab === t ? "active" : ""}
            to={`/projects/${id}${path}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <ErrorBox error={actionError} />
      {tab === "overview" ? (
        <>
          <div className="overview-grid">
            <div className="context-main">
              <section className="panel">
                <div className="section-title">
                  <h2>Goal</h2>
                  <Link to={`/projects/${id}/edit`}>
                    <Pencil size={16} />
                    Edit
                  </Link>
                </div>
                <p className="prewrap">
                  {ctx.goal ||
                    "What are you working toward? Add a goal to start."}
                </p>
              </section>
              <section className="panel">
                <div className="section-title">
                  <h2>Current state</h2>
                  <Link to={`/projects/${id}/edit`}>
                    <Pencil size={16} />
                    Edit
                  </Link>
                </div>
                <p className="prewrap">
                  {ctx.summary || "No current summary recorded."}
                </p>
              </section>
              <section className="panel">
                <div className="section-title">
                  <h2>Decisions</h2>
                  <Link to={`/projects/${id}/edit`}>
                    <Plus size={16} />
                    Add decision
                  </Link>
                </div>
                <Entries entries={ctx.decisions} />
              </section>
            </div>
            <aside className="next-rail">
              <section>
                <h2>
                  <ArrowRightCircle />
                  Next action
                </h2>
                <p>
                  {ctx.nextSteps[0]?.text ||
                    "Add your initial context and choose the next action."}
                </p>
              </section>
              <section>
                <h2>
                  <FileText />
                  Constraints
                </h2>
                <Entries entries={ctx.constraints} />
              </section>
              <section>
                <h2>
                  <Clock />
                  Latest revision
                </h2>
                <p className="muted">
                  Revision {p.version} · Saved by {r.author}
                </p>
                <small>{when(r.created_at)}</small>
              </section>
            </aside>
          </div>
          <div className="two-columns">
            <section className="panel">
              <div className="section-title">
                <h2>
                  <FileText />
                  Notes
                </h2>
                <Link to={`/projects/${id}/edit`}>Add note</Link>
              </div>
              <Entries entries={ctx.notes} />
            </section>
            <section className="panel">
              <div className="section-title">
                <h2>
                  <Link2 />
                  Sources
                </h2>
                <Link to={`/projects/${id}/edit`}>Add source</Link>
              </div>
              <References entries={ctx.sources} />
            </section>
          </div>
          <div className="two-columns">
            {(
              [
                "completedWork",
                "nextSteps",
                "openQuestions",
                "artifacts",
              ] as const
            ).map((k) => (
              <section className="panel" key={k}>
                <h2>{labels[k]}</h2>
                {k === "artifacts" ? (
                  <References entries={ctx[k]} />
                ) : (
                  <Entries entries={ctx[k]} />
                )}
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>Continue with another assistant</h2>
            <p>
              Create a handoff and copy it, or{" "}
              <Link to="/connections">connect an assistant</Link>. Your saved
              context stays private in Cove.
            </p>
          </section>
        </>
      ) : tab === "portability" ? (
        <ProjectSettings p={p} refresh={refresh} />
      ) : (
        <RecordList
          projectId={id!}
          tab={tab}
          currentVersion={p.version}
          refreshProject={refresh}
        />
      )}
    </>
  );
}
function Entries({ entries }: { entries: any[] }) {
  return entries.length ? (
    <ul className="entries">
      {entries.map((e) => (
        <li key={e.id}>
          <p className="prewrap">{e.text}</p>
          <small>
            {e.kind.replaceAll("-", " ")}
            {e.sourceIds.length
              ? ` · ${e.sourceIds.length} source reference(s), not verified`
              : ""}
          </small>
        </li>
      ))}
    </ul>
  ) : (
    <Empty>
      <p>Nothing recorded yet.</p>
    </Empty>
  );
}
function References({ entries }: { entries: any[] }) {
  return (
    <>
      {entries.length ? (
        <ul className="entries">
          {entries.map((e) => (
            <li key={e.id}>
              {/^https?:\/\//i.test(e.location) ? (
                <a href={e.location} target="_blank" rel="noopener noreferrer">
                  {e.label}
                </a>
              ) : (
                <strong>{e.label}</strong>
              )}
              <p className="prewrap">{e.location}</p>
              <p>{e.description}</p>
              <small>
                {e.availability}
                {e.version && ` · ${e.version}`}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          <p>No references yet.</p>
        </Empty>
      )}
      <small>
        References are pointers. Their contents are not fetched or verified by
        Cove.
      </small>
    </>
  );
}
function RecordList({
  projectId,
  tab,
  currentVersion,
  refreshProject,
}: {
  projectId: string;
  tab: string;
  currentVersion: number;
  refreshProject: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const kind =
    tab === "history"
      ? "revisions"
      : tab === "activity"
        ? "events"
        : "handoffs";
  const { data, error, refresh } = useData(
    `/api/projects/${projectId}/${kind}?offset=${offset}`,
  );
  const [diff, setDiff] = useState<any>();
  const [actionError, setError] = useState<Error>();
  return (
    <>
      <ErrorBox error={error || actionError} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            {!data.items.length ? (
              <Empty>
                <p>
                  {tab === "handoffs"
                    ? "Create a handoff to save a starting point for your next assistant."
                    : "No history yet."}
                </p>
              </Empty>
            ) : (
              <div className="records">
                {data.items.map((r: any) => (
                  <article className="record" key={r.id}>
                    <div>
                      <h2>
                        {tab === "handoffs" ? (
                          <Link to={`/projects/${projectId}/handoffs/${r.id}`}>
                            Handoff · Revision {r.version}
                          </Link>
                        ) : tab === "history" ? (
                          `Revision ${r.version} · ${r.summary}`
                        ) : (
                          r.operation.replaceAll("_", " ")
                        )}
                      </h2>
                      <p className="muted">
                        {r.author || r.actor || "Saved snapshot"} ·{" "}
                        {when(r.created_at)}
                      </p>
                    </div>
                    {tab === "history" && (
                      <div className="actions">
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              setDiff(
                                await api(
                                  `/api/projects/${projectId}/changes?from=${r.version}&to=${currentVersion}`,
                                ),
                              );
                            } catch (e) {
                              setError(e as Error);
                            }
                          }}
                        >
                          Compare with latest
                        </button>
                        {r.version !== currentVersion && (
                          <button
                            className="quiet"
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Restore revision ${r.version} as a new revision? Current work remains in history.`,
                                )
                              )
                                return;
                              try {
                                await post(
                                  `/api/projects/${projectId}/restore`,
                                  {
                                    version: r.version,
                                    expectedVersion: currentVersion,
                                    requestKey: key(),
                                  },
                                );
                                refresh();
                                refreshProject();
                              } catch (e) {
                                setError(e as Error);
                              }
                            }}
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            <div className="actions">
              {offset > 0 && (
                <button onClick={() => setOffset(Math.max(0, offset - 20))}>
                  Previous
                </button>
              )}
              {data.nextOffset !== null && (
                <button onClick={() => setOffset(data.nextOffset)}>Next</button>
              )}
            </div>
          </>
        )
      )}
      {diff && (
        <section className="panel">
          <h2>
            Revision {diff.from} compared with {diff.to}
          </h2>
          <Compare items={diff.changes} />
          <button className="quiet" onClick={() => setDiff(undefined)}>
            Close comparison
          </button>
        </section>
      )}
    </>
  );
}
export function Handoff() {
  const { id, hid } = useParams();
  const { data, error } = useData(`/api/projects/${id}/handoffs/${hid}`);
  const [full, setFull] = useState(false);
  if (!data)
    return (
      <>
        <ErrorBox error={error} />
        {!error && <Loading />}
      </>
    );
  return (
    <>
      <p className="breadcrumb">
        <Link to={`/projects/${id}/handoffs`}>Handoffs</Link> / Revision{" "}
        {data.version}
      </p>
      <PageHead
        title="Ready to continue"
        description={`${data.snapshot.projectName} · Saved by ${data.snapshot.creator} · ${when(data.snapshot.createdAt)}`}
        actions={
          <CopyButton
            text={full ? data.full : data.concise}
            label={full ? "Copy full handoff" : "Copy concise handoff"}
            onCopied={() => post(`/api/projects/${id}/handoffs/${hid}/copied`)}
          />
        }
      />
      {data.hasNewerChanges && (
        <div className="notice">
          <strong>
            Newer context is available: revision {data.currentVersion}.
          </strong>
          <p>
            This handoff remains pinned to revision {data.version}. Review
            changes below before continuing.
          </p>
          <Compare items={data.changes} />
        </div>
      )}
      <div className="actions">
        <button
          className={!full ? "" : "secondary"}
          onClick={() => setFull(false)}
        >
          Concise handoff
        </button>
        <button
          className={full ? "" : "secondary"}
          onClick={() => setFull(true)}
        >
          Full handoff
        </button>
        <Link to={`/projects/${id}`}>Open current project</Link>
      </div>
      <pre className="handoff-text">{full ? data.full : data.concise}</pre>
      <section className="panel">
        <h2>Continue prompt</h2>
        <pre className="prompt">{`Retrieve Cove handoff ${hid} for project ${id}. Keep the original snapshot separate from current context, inspect newer changes, and identify missing information before proceeding. Read full current context before saving an update with expectedVersion. Report the actual saved revision or handoff ID.`}</pre>
        <CopyButton
          text={`Retrieve Cove handoff ${hid} for project ${id}. Inspect newer changes separately and identify missing information before continuing. Read full current context before saving with expectedVersion. Report the saved revision or handoff ID.`}
        />
      </section>
      <p className="muted">
        Copying or retrieval does not prove another assistant used the handoff.
        Text copied outside Cove cannot be revoked.
      </p>
    </>
  );
}
function ProjectSettings({ p, refresh }: { p: any; refresh: () => void }) {
  const [error, setError] = useState<Error>();
  const [confirmation, setConfirmation] = useState("");
  const nav = useNavigate();
  return (
    <>
      <section className="panel">
        <h2>Export your project</h2>
        <p>
          Includes context, revisions, and handoffs. Credentials and assistant
          permissions stay out of exports.
        </p>
        <div className="actions">
          <Download url={`/api/projects/${p.id}/export`}>
            Download JSON
          </Download>
          <Download url={`/api/projects/${p.id}/export?format=markdown`}>
            Download Markdown
          </Download>
        </div>
      </section>
      <section className="panel">
        <h2>{p.archived ? "Unarchive" : "Archive"} project</h2>
        <p>
          Archiving hides the project from the default list. It keeps the
          context and existing assistant grants.
        </p>
        <button
          className="secondary"
          onClick={async () => {
            try {
              await post(`/api/projects/${p.id}/archive`, {
                archived: !p.archived,
              });
              refresh();
            } catch (e) {
              setError(e as Error);
            }
          }}
        >
          {p.archived ? "Unarchive" : "Archive"}
        </button>
      </section>
      <section className="panel danger">
        <h2>Permanently delete project</h2>
        <p>
          Deletes context, revisions, handoffs, grants, and activity. Copied
          text outside Cove remains outside your control. Backups expire under
          the operator’s retention policy.
        </p>
        <label>
          Type {p.name} to confirm
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        <button
          className="danger-button"
          disabled={confirmation !== p.name}
          onClick={async () => {
            try {
              await api(`/api/projects/${p.id}`, {
                method: "DELETE",
                body: JSON.stringify({ confirmation }),
              });
              nav("/projects");
            } catch (e) {
              setError(e as Error);
            }
          }}
        >
          Delete project permanently
        </button>
      </section>
      <ErrorBox error={error} />
    </>
  );
}
