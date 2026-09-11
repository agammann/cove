import React from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  NavLink,
  Link,
  useNavigate,
} from "react-router-dom";
import { Folder, Users, User, LogOut } from "lucide-react";
import { AuthPage, Landing } from "./Auth.js";
import { Projects, NewProject } from "./Projects.js";
import { Project, Handoff } from "./Project.js";
import { Editor } from "./Editor.js";
import { Connections, Consent } from "./Connections.js";
import { Account } from "./Account.js";
import { useData, ErrorBox, Loading, post } from "./lib.js";
import "./style.css";
function Shell() {
  const { data, error } = useData("/api/me");
  const nav = useNavigate();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/projects" className="brand">
          Cove
        </Link>
        <nav aria-label="Workspace">
          <NavLink to="/projects">
            <Folder />
            Projects
          </NavLink>
          <NavLink to="/connections">
            <Users />
            Assistant connections
          </NavLink>
          <NavLink to="/account">
            <User />
            Account
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <p>
            Your work, wherever
            <br />
            your agents go.
          </p>
          {data && (
            <>
              <small>{data.name}</small>
              <button
                className="sidebar-signout"
                onClick={async () => {
                  await post("/api/auth/sign-out");
                  nav("/sign-in");
                }}
              >
                <LogOut size={16} />
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>
      <main id="main" className="workspace">
        {error ? <ErrorBox error={error} /> : !data ? <Loading /> : <Outlet />}
      </main>
    </div>
  );
}
const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/sign-in", element: <AuthPage /> },
  { path: "/sign-up", element: <AuthPage mode="sign-up" /> },
  { path: "/recover", element: <AuthPage mode="recover" /> },
  { path: "/reset-password", element: <AuthPage mode="reset" /> },
  {
    element: <Shell />,
    children: [
      { path: "/projects", element: <Projects /> },
      { path: "/projects/new", element: <NewProject /> },
      { path: "/projects/:id", element: <Project /> },
      { path: "/projects/:id/edit", element: <Editor /> },
      { path: "/projects/:id/handoffs", element: <Project tab="handoffs" /> },
      { path: "/projects/:id/handoffs/:hid", element: <Handoff /> },
      { path: "/projects/:id/history", element: <Project tab="history" /> },
      { path: "/projects/:id/activity", element: <Project tab="activity" /> },
      {
        path: "/projects/:id/settings",
        element: <Project tab="portability" />,
      },
      { path: "/connections", element: <Connections /> },
      { path: "/consent", element: <Consent /> },
      { path: "/account", element: <Account /> },
    ],
  },
  {
    path: "*",
    element: (
      <main className="auth-page">
        <h1>Page not found</h1>
        <Link to="/projects">Open projects</Link>
      </main>
    ),
  },
]);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
