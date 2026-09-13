import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Waves, FileText } from "lucide-react";
import { ErrorBox, post } from "./lib.js";
export function Brand() {
  return (
    <span className="brand-lockup">
      <Waves aria-hidden="true" />
      <span>Cove</span>
    </span>
  );
}
export function SitesSignIn() {
  const [params] = useSearchParams();
  const [error, setError] = useState<Error>();
  const oauth = params.has("client_id") || params.has("oauth_query");
  useEffect(() => {
    if (params.get("complete") === "1" && oauth) {
      const query = new URLSearchParams(params);
      query.delete("complete");
      post("/api/auth/oauth2/continue", {
        postLogin: true,
        oauth_query: params.get("oauth_query") || query.toString(),
      })
        .then((r) => window.location.assign(r.url || r.redirect_uri))
        .catch(setError);
    }
  }, [params, oauth]);
  const done = oauth ? `/sign-in?complete=1&${params.toString()}` : "/projects";
  const bridge = `/api/auth/chatgpt?returnTo=${encodeURIComponent(done)}`;
  return (
    <main className="auth-page sites-auth">
      <Link className="brand" to="/">
        <Brand />
      </Link>
      <div className="auth-panel">
        <h1>
          A place to
          <br />
          <span>pick up the thread.</span>
        </h1>
        <p>Your projects, decisions, and next steps. Ready when you are.</p>
        <ErrorBox error={error} />
        <a
          className="button"
          target="_top"
          href={`/signin-with-chatgpt?return_to=${encodeURIComponent(bridge)}`}
        >
          Continue with ChatGPT <ArrowRight size={18} />
        </a>
        <p className="auth-note">
          Sign in to your private workspace. You choose which projects an
          assistant can access.
        </p>
        <Link to="/">Back to Cove</Link>
      </div>
    </main>
  );
}
export function NewLanding() {
  return (
    <main className="cove-home">
      <div className="home-top">
        <img className="flow-art" src="/cove-flow.png" alt="" />
        <nav className="home-nav">
          <Link className="brand" to="/">
            <Brand />
          </Link>
          <div className="home-nav-links">
            <a href="#how-it-works">How it works</a>
            <Link to="/projects">Your workspace</Link>
          </div>
          <Link className="button" to="/sign-in">
            Open Cove <ArrowRight size={18} />
          </Link>
        </nav>
        <section className="home-hero">
          <h1>
            Keep the context.
            <br />
            <span>Find your flow.</span>
          </h1>
          <p>
            A home for your goals, decisions, sources, and next steps.
            <br className="desktop-break" /> Pick up the thread wherever you
            work.
          </p>
          <div className="actions">
            <Link className="button" to="/sign-up">
              Create your workspace <ArrowRight size={20} />
            </Link>
            <a className="home-text-link" href="#how-it-works">
              See how it works <ArrowRight size={18} />
            </a>
          </div>
        </section>
      </div>
      <section className="home-story" id="how-it-works">
        <div className="home-story-intro">
          <h2>
            One project.
            <br />A clear next move.
          </h2>
          <article
            className="sample-project"
            aria-label="Illustrative project example"
          >
            <small>Example project</small>
            <div className="sample-body">
              <h3>
                <FileText />
                Research notebook
              </h3>
              <div className="sample-tabs">
                <span>Overview</span>
                <span>History</span>
                <span>Handoffs</span>
              </div>
              <h4>Goal</h4>
              <p>Turn research into a clear project brief.</p>
              <h4>Next steps</h4>
              <p>
                Review sources
                <br />
                Write the first draft
              </p>
            </div>
          </article>
        </div>
        <div className="workflow-rows">
          {[
            [
              "Save what matters",
              "Keep goals, decisions, and sources together.",
            ],
            [
              "Capture the handoff",
              "Create a snapshot you can copy into your next conversation.",
            ],
            [
              "Keep moving",
              "Return to your saved context and see what changed.",
            ],
          ].map(([title, text], i) => (
            <article key={title}>
              <span>0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="home-close">
        <h2>Your work. Your continuity.</h2>
        <Link className="button" to="/sign-in">
          Open Cove <ArrowRight size={20} />
        </Link>
        <p>Cove stores only what you choose to submit.</p>
      </section>
      <footer className="home-footer">
        <Link className="brand" to="/">
          <Brand />
        </Link>
        <p>Private projects. Portable context.</p>
        <a
          href="https://github.com/agammann/cove"
          target="_blank"
          rel="noreferrer"
        >
          About this release
        </a>
      </footer>
    </main>
  );
}
