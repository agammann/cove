import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorBox, post } from "./lib.js";
export function AuthPage({
  mode = "sign-in",
}: {
  mode?: "sign-in" | "sign-up" | "recover" | "reset";
}) {
  const [error, setError] = useState<Error>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const nav = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const f = new FormData(e.currentTarget);
    try {
      if (mode === "recover") {
        await post("/api/auth/request-password-reset", {
          email: f.get("email"),
          redirectTo: "/reset-password",
        });
        setMessage("If that account exists, a recovery link is on its way.");
      } else if (mode === "reset") {
        await post("/api/auth/reset-password", {
          newPassword: f.get("password"),
          token: params.get("token"),
        });
        setMessage("Password updated. You can sign in now.");
      } else if (mode === "sign-up") {
        await post("/api/auth/sign-up/email", {
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
          callbackURL: "/projects",
        });
        setMessage("Check your email to verify your account and open Cove.");
      } else {
        await post("/api/auth/sign-in/email", {
          email: f.get("email"),
          password: f.get("password"),
        });
        if (params.has("client_id") || params.has("oauth_query")) {
          const r = await post("/api/auth/oauth2/continue", {
            postLogin: true,
            oauth_query: params.get("oauth_query") || params.toString(),
          });
          window.location.assign(r.url || r.redirect_uri);
        } else nav("/projects");
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  const title = {
    "sign-in": "Welcome back",
    "sign-up": "Make room for your next idea",
    recover: "Recover your account",
    reset: "Choose a new password",
  }[mode];
  return (
    <main className="auth-page">
      <Link className="brand" to="/">
        Cove
      </Link>
      <div className="auth-panel">
        <h1>{title}</h1>
        <p className="muted">Your work, wherever your agents go.</p>
        <ErrorBox error={error} />
        {message ? (
          <div role="status">
            <p>{message}</p>
            <Link to="/sign-in">Go to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            {mode === "sign-up" && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={100}
                  required
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {!["recover"].includes(mode) && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  required
                />
              </label>
            )}
            <button disabled={busy} type="submit">
              {busy
                ? "Please wait…"
                : mode === "sign-in"
                  ? "Sign in"
                  : mode === "sign-up"
                    ? "Create account"
                    : mode === "recover"
                      ? "Send recovery link"
                      : "Save password"}
            </button>
          </form>
        )}
        <div className="auth-links">
          <Link to={mode === "sign-in" ? "/sign-up" : "/sign-in"}>
            {mode === "sign-in" ? "Create an account" : "Sign in"}
          </Link>
          {mode === "sign-in" && <Link to="/recover">Forgot password?</Link>}
        </div>
      </div>
    </main>
  );
}
export function Landing() {
  return (
    <main className="landing">
      <nav>
        <Link className="brand" to="/">
          Cove
        </Link>
        <Link className="button secondary" to="/sign-in">
          Sign in
        </Link>
      </nav>
      <section>
        <h1>
          Switch assistants.
          <br />
          Keep your project moving.
        </h1>
        <p className="lead">Your work, wherever your agents go.</p>
        <p>
          Keep goals, decisions, sources, and next steps together. Save the
          context you choose, create a handoff, and pick up where you left off.
        </p>
        <Link className="button" to="/sign-up">
          Create your workspace
        </Link>
      </section>
      <div className="landing-details">
        <article>
          <h2>A clear starting point</h2>
          <p>
            Private projects with structured context, saved revisions, and
            readable changes.
          </p>
        </article>
        <article>
          <h2>Continue your way</h2>
          <p>
            Copy a handoff manually or authorize an assistant for selected
            projects. Cove works without its own model subscription.
          </p>
        </article>
        <article>
          <h2>Stay in control</h2>
          <p>
            Review assistant permissions, revoke access, export your projects,
            or delete your account.
          </p>
        </article>
      </div>
      <footer>
        <p>
          Cove stores what you explicitly submit. It does not read private
          conversations or assistant memory. Connecting an assistant does not
          guarantee it will use Cove.
        </p>
        <p>
          Early access software. See the release documentation for verified
          compatibility and operating requirements.
        </p>
      </footer>
    </main>
  );
}
