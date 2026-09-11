import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import {
  contextSchema,
  labels,
  type Context,
} from "../../../packages/shared/context.js";
import {
  api,
  ApiError,
  useData,
  ErrorBox,
  Loading,
  PageHead,
  key,
  Compare,
} from "./lib.js";
const listFields = [
  "constraints",
  "decisions",
  "notes",
  "completedWork",
  "nextSteps",
  "openQuestions",
] as const;
export function Editor() {
  const { id } = useParams();
  const { data, error } = useData(`/api/projects/${id}`);
  if (!data)
    return (
      <>
        <ErrorBox error={error} />
        {!error && <Loading />}
      </>
    );
  return <EditorForm data={data} />;
}
function EditorForm({ data }: { data: any }) {
  const p = data.project;
  const nav = useNavigate();
  const [draft, setDraft] = useState<Context>(() =>
    structuredClone(data.revision.context),
  );
  const [base, setBase] = useState<Context>(data.revision.context);
  const [version, setVersion] = useState(p.version);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<Error>();
  const [conflict, setConflict] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef<{ payload: string; requestKey: string } | undefined>(
    undefined,
  );
  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(base);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  useEffect(() => {
    if (saved) nav(`/projects/${p.id}`);
  }, [saved, nav, p.id]);
  function change(k: keyof Context, value: any) {
    setDraft((d) => ({ ...d, [k]: value }));
  }
  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const parsed = contextSchema.safeParse(draft);
      if (!parsed.success)
        throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
      const payload = JSON.stringify({
        context: draft,
        expectedVersion: version,
        summary: summary || "Context updated",
      });
      if (pending.current?.payload !== payload)
        pending.current = { payload, requestKey: key() };
      await api(`/api/projects/${p.id}/context`, {
        method: "PUT",
        body: JSON.stringify({
          context: draft,
          expectedVersion: version,
          summary: summary || "Context updated",
          requestKey: pending.current.requestKey,
        }),
      });
      setSaved(true);
    } catch (e) {
      setError(e as Error);
      if (e instanceof ApiError && e.code === "VERSION_CONFLICT") {
        try {
          const [diff, latest] = await Promise.all([
            api(e.details.changesPath),
            api(`/api/projects/${p.id}`),
          ]);
          setConflict({ ...diff, latest });
        } catch (e) {
          setError(e as Error);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title="Update context"
        description={`${p.name} · Editing from revision ${version}`}
        actions={
          <>
            <button
              className="secondary"
              onClick={() => nav(`/projects/${p.id}`)}
            >
              Cancel
            </button>
            <button disabled={busy || !!conflict} onClick={save}>
              {busy ? "Saving…" : "Save context"}
            </button>
          </>
        }
      />
      <ErrorBox error={error} />
      {blocker.state === "blocked" && (
        <div className="notice" role="alert">
          <h2>Keep your unsaved work?</h2>
          <p>Leaving this editor discards this draft.</p>
          <div className="actions">
            <button onClick={() => blocker.reset()}>
              Stay and keep editing
            </button>
            <button className="secondary" onClick={() => blocker.proceed()}>
              Discard and leave
            </button>
          </div>
        </div>
      )}
      {conflict && (
        <section className="notice">
          <h2>Someone saved a newer revision</h2>
          <p>
            Your draft is still below. Review the changes and reconcile your
            fields before retrying. Preparing a retry does not merge or save
            anything.
          </p>
          <Compare items={conflict.changes} />
          <button
            onClick={() => {
              setVersion(conflict.latest.project.version);
              setBase(conflict.latest.revision.context);
              setConflict(undefined);
              setError(undefined);
            }}
          >
            Keep my draft and prepare an explicit retry at revision{" "}
            {conflict.latest.project.version}
          </button>
        </section>
      )}
      <div className="editor">
        <section className="panel">
          <label>
            Goal
            <textarea
              aria-label="Goal"
              maxLength={4000}
              value={draft.goal}
              onChange={(e) => change("goal", e.target.value)}
              rows={3}
            />
          </label>
          <label>
            Current state
            <textarea
              aria-label="Current state"
              maxLength={4000}
              value={draft.summary}
              onChange={(e) => change("summary", e.target.value)}
              rows={4}
            />
          </label>
        </section>
        {listFields.map((k) => (
          <section className="panel" key={k}>
            <div className="section-title">
              <h2>{labels[k]}</h2>
              <button
                className="quiet"
                disabled={draft[k].length >= 100}
                onClick={() =>
                  change(k, [
                    ...draft[k],
                    {
                      id: key(),
                      text: "",
                      kind: k === "decisions" ? "decision" : "agent-assertion",
                      sourceIds: [],
                    },
                  ])
                }
              >
                <Plus size={16} />
                Add{" "}
                {k === "nextSteps"
                  ? "next step"
                  : k === "completedWork"
                    ? "completed work"
                    : k === "openQuestions"
                      ? "question"
                      : k === "notes"
                        ? "note"
                        : k === "constraints"
                          ? "constraint"
                          : "decision"}
              </button>
            </div>
            {draft[k].map((entry, i) => (
              <div className="editor-entry" key={entry.id}>
                <label>
                  {labels[k]} {i + 1}
                  <textarea
                    aria-label={`${labels[k]} ${i + 1}`}
                    maxLength={4000}
                    value={entry.text}
                    onChange={(e) =>
                      change(
                        k,
                        draft[k].map((x) =>
                          x.id === entry.id
                            ? { ...x, text: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <div className="entry-meta">
                  <label>
                    Statement type
                    <select
                      value={entry.kind}
                      onChange={(e) =>
                        change(
                          k,
                          draft[k].map((x) =>
                            x.id === entry.id
                              ? { ...x, kind: e.target.value }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="user-preference">User preference</option>
                      <option value="decision">Decision</option>
                      <option value="agent-assertion">Agent assertion</option>
                      <option value="source-backed">
                        Statement with source references
                      </option>
                    </select>
                  </label>
                  <label>
                    Source references
                    <select
                      multiple
                      aria-label={`Sources for ${labels[k]} ${i + 1}`}
                      value={entry.sourceIds}
                      onChange={(e) =>
                        change(
                          k,
                          draft[k].map((x) =>
                            x.id === entry.id
                              ? {
                                  ...x,
                                  sourceIds: Array.from(
                                    e.target.selectedOptions,
                                    (o) => o.value,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      {[...draft.sources, ...draft.artifacts].map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="quiet"
                    aria-label={`Remove ${labels[k]} ${i + 1}`}
                    onClick={() =>
                      change(
                        k,
                        draft[k].filter((x) => x.id !== entry.id),
                      )
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </section>
        ))}
        {(["sources", "artifacts"] as const).map((k) => (
          <section className="panel" key={k}>
            <div className="section-title">
              <h2>{labels[k]}</h2>
              <button
                className="quiet"
                disabled={draft[k].length >= 100}
                onClick={() =>
                  change(k, [
                    ...draft[k],
                    {
                      id: key(),
                      label: "",
                      location: "",
                      description: "",
                      version: "",
                      availability: "unknown",
                    },
                  ])
                }
              >
                Add {k === "sources" ? "source" : "artifact"}
              </button>
            </div>
            <p className="muted">
              Save a link or a descriptive file path. Cove does not fetch it or
              verify its contents.
            </p>
            {draft[k].map((r, i) => (
              <div className="editor-entry" key={r.id}>
                {(["label", "location", "description", "version"] as const).map(
                  (field) => (
                    <label key={field}>
                      {field === "location"
                        ? "URL or file path"
                        : field === "version"
                          ? "Version or commit"
                          : field[0].toUpperCase() + field.slice(1)}{" "}
                      {i + 1}
                      <input
                        maxLength={
                          field === "description"
                            ? 4000
                            : field === "location"
                              ? 2000
                              : 200
                        }
                        value={r[field]}
                        onChange={(e) =>
                          change(
                            k,
                            draft[k].map((x) =>
                              x.id === r.id
                                ? { ...x, [field]: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                  ),
                )}
                <label>
                  Availability
                  <select
                    value={r.availability}
                    onChange={(e) =>
                      change(
                        k,
                        draft[k].map((x) =>
                          x.id === r.id
                            ? { ...x, availability: e.target.value }
                            : x,
                        ),
                      )
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="available">Reported available</option>
                    <option value="unavailable">Reported unavailable</option>
                  </select>
                </label>
                <button
                  className="quiet"
                  onClick={() => {
                    setDraft((d) => {
                      const out = {
                        ...d,
                        [k]: d[k].filter((x) => x.id !== r.id),
                      };
                      for (const f of listFields)
                        out[f] = out[f].map((x) => ({
                          ...x,
                          sourceIds: x.sourceIds.filter((s) => s !== r.id),
                        }));
                      return out;
                    });
                  }}
                >
                  Remove reference
                </button>
              </div>
            ))}
          </section>
        ))}
        <section className="panel">
          <label>
            Change summary
            <input
              maxLength={300}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What changed?"
            />
          </label>
          <p className="muted">
            Up to 64 KiB per context document and 100 entries per section.
            Drafts remain in this open editor; unsaved work is not uploaded.
          </p>
          <button disabled={busy || !!conflict} onClick={save}>
            Save context
          </button>
        </section>
      </div>
    </>
  );
}
