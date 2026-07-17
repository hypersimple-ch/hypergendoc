"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError, workspaceApi } from "../lib/api-client";
import { authClient } from "../lib/auth-client";

const links = [
  ["/workspace", "Overview"],
  ["/workspace/companies", "Companies"],
  ["/workspace/styles", "Styles"],
  ["/workspace/documents", "Documents"],
  ["/workspace/members", "Members"],
  ["/workspace/credentials", "MCP access"],
  ["/workspace/audit", "Audit log"],
] as const;

export function SessionBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "error">(
    "checking",
  );
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    workspaceApi
      .current()
      .then(() => alive && setState("ready"))
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && caught.code === "unauthenticated") {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        if (caught instanceof ApiError && caught.code === "forbidden") {
          router.replace("/setup");
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "We could not verify workspace access. Please try again.",
        );
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [pathname, router]);
  if (state === "checking")
    return (
      <main className="session-loading" aria-live="polite">
        Checking your secure session…
      </main>
    );
  if (state === "error")
    return (
      <main className="session-loading" role="alert">
        {error}
      </main>
    );
  return <>{children}</>;
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }
  return (
    <div className="workspace-shell">
      <header className="workspace-top">
        <Link href="/workspace" className="wordmark">
          Hyper<span>Gen</span>Doc
        </Link>
        <button
          className="menu-button"
          aria-expanded={open}
          aria-controls="workspace-navigation"
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
        <button
          className="avatar"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => void signOut()}
        >
          HG
        </button>
      </header>
      <aside
        id="workspace-navigation"
        className={`sidebar ${open ? "sidebar--open" : ""}`}
      >
        <p className="workspace-label">Current workspace</p>
        <strong>Document studio</strong>
        <nav aria-label="Workspace">
          <ul>
            {links.map(([href, label]) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="sidebar-note">
          Membership and permissions are resolved by the server for every
          request.
        </p>
      </aside>
      <main className="workspace-main">{children}</main>
    </div>
  );
}
