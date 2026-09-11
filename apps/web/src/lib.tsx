import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: any,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const r = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await r.json();
  if (!r.ok)
    throw new ApiError(
      data.error?.code || data.code || "REQUEST_FAILED",
      data.error?.message || data.message || "Request failed.",
      data.error || data,
      r.status,
    );
  return data;
}
export const post = (url: string, data: unknown = {}) =>
  api(url, { method: "POST", body: JSON.stringify(data) });
export const key = () => crypto.randomUUID();
export const when = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
export function useData<T = any>(url: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError(undefined);
    api<T>(url)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [url, tick]);
  return { data, error, refresh: () => setTick((n) => n + 1) };
}
export function ErrorBox({ error }: { error: Error | undefined }) {
  return error ? (
    <div role="alert" className="notice error">
      <strong>{error.message}</strong>
      {error instanceof ApiError && error.status === 401 && (
        <p>
          <Link to="/sign-in" target="_blank">
            Sign in in a new tab
          </Link>
          , then retry here. Your draft remains available.
        </p>
      )}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <p role="status" className="muted">
      Loading your workspace…
    </p>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function PageHead({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{actions}</div>
    </header>
  );
}
export function Download({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  return (
    <a className="button secondary" href={url} download>
      {children}
    </a>
  );
}
export async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}
export function CopyButton({
  text,
  label = "Copy",
  onCopied,
}: {
  text: string;
  label?: string;
  onCopied?: () => Promise<unknown>;
}) {
  const [state, setState] = useState("");
  return (
    <>
      <button
        onClick={async () => {
          try {
            await copy(text);
            setState("Copied");
            if (onCopied) await onCopied();
          } catch {
            setState(
              "Copy failed or could not be recorded. Select the text and copy manually.",
            );
          }
        }}
      >
        {label}
      </button>
      <span role="status" className="muted">
        {state}
      </span>
    </>
  );
}
export function Compare({ items }: { items: any[] }) {
  return (
    <div className="comparison">
      {items.length ? (
        items.map((i) => (
          <section key={i.field}>
            <h3>{i.label}</h3>
            <div className="compare-grid">
              <div>
                <strong>Earlier</strong>
                <Value value={i.before} />
              </div>
              <div>
                <strong>Later</strong>
                <Value value={i.after} />
              </div>
            </div>
          </section>
        ))
      ) : (
        <p>No context differences.</p>
      )}
    </div>
  );
}
function Value({ value }: { value: any }) {
  return typeof value === "string" ? (
    <p className="prewrap">{value || "Empty"}</p>
  ) : (
    <ul>
      {value.map((e: any) => (
        <li key={e.id}>
          {e.text || `${e.label}: ${e.location}`}
          {e.kind && <small>{e.kind}</small>}
        </li>
      ))}
    </ul>
  );
}
