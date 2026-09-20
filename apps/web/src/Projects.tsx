import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, ArrowUpRight, Folder } from "lucide-react";
import {
  useData,
  PageHead,
  ErrorBox,
  Loading,
  Empty,
  post,
  when,
} from "./lib.js";
export function Projects() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [archived, setArchived] = useState(false);
  const { data, error } = useData(
    search
      ? `/api/search?query=${encodeURIComponent(search)}&offset=${offset}`
      : `/api/projects?offset=${offset}`,
  );
  const visibleProjects =
    data?.items.filter((p: any) => archived || !p.archived) ?? [];
  return (
    <>
      <PageHead
        title="Your projects"
        description="A clear starting point for your next assistant."
        actions={
          <Link className="button" to="/projects/new">
            <Plus size={18} />
            New project
          </Link>
        }
      />
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query);
          setOffset(0);
        }}
      >
        <Search size={18} />
        <input
          aria-label="Search project context"
          placeholder="Search your project context"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
        />
        <button type="submit" className="secondary">
          Search
        </button>
        {search && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setQuery("");
              setSearch("");
              setOffset(0);
            }}
          >
            Clear
          </button>
        )}
      </form>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => setArchived(e.target.checked)}
        />
        Include archived projects
      </label>
      <ErrorBox error={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="project-list">
              {visibleProjects.map((p: any) => (
                <Link
                  className="project-row"
                  key={p.id}
                  to={`/projects/${p.id}`}
                >
                  <Folder size={24} />
                  <div>
                    <h2>
                      {p.name}
                      {p.archived && " (archived)"}
                    </h2>
                    <p>
                      {p.description ||
                        p.summary ||
                        "Add your goal and first next step."}
                    </p>
                  </div>
                  <span className="muted">
                    Revision {p.version}
                    {p.updated_at && <small>{when(p.updated_at)}</small>}
                  </span>
                  <ArrowUpRight size={20} />
                </Link>
              ))}
            </div>
            {!visibleProjects.length && (
              <Empty>
                <h2>
                  {search
                    ? "No matching projects on this page."
                    : data.items.length || offset > 0
                      ? "No active projects on this page."
                      : "Give your work a place to continue."}
                </h2>
                <p>
                  {search
                    ? "Try a different search or clear it to browse your projects."
                    : data.items.length || offset > 0
                      ? "Include archived projects, browse another page, or start a new project."
                      : "Create a project, add your goal, then save a handoff for your next assistant."}
                </p>
                <Link className="button" to="/projects/new">
                  {search || data.items.length || offset > 0
                    ? "Create a project"
                    : "Create your first project"}
                </Link>
              </Empty>
            )}
            <div className="actions">
              {offset > 0 && (
                <button
                  className="secondary"
                  onClick={() => setOffset(Math.max(0, offset - 20))}
                >
                  Previous
                </button>
              )}
              {data.nextOffset !== null && (
                <button
                  className="secondary"
                  onClick={() => setOffset(data.nextOffset)}
                >
                  Next
                </button>
              )}
            </div>
          </>
        )
      )}
    </>
  );
}
export function NewProject() {
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const p = await post("/api/projects", {
        name: form.get("name"),
        description: form.get("description"),
      });
      nav(`/projects/${p.id}/edit`);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        title="Create a project"
        description="Start with a name. Add the context you want to carry forward next."
      />
      <form className="form-panel" onSubmit={submit}>
        <ErrorBox error={error} />
        <label>
          Project name
          <input name="name" maxLength={120} required autoFocus />
        </label>
        <label>
          Description
          <textarea name="description" maxLength={1000} />
        </label>
        <div className="actions">
          <button disabled={busy}>Create project</button>
          <Link to="/projects">Cancel</Link>
        </div>
      </form>
    </>
  );
}
