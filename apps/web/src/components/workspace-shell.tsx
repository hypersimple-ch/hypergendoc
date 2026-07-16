"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready">("checking");
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/get-session", { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("expired");
        return response.json();
      })
      .then(() => alive && setState("ready"))
      .catch(() => {
        if (alive) router.replace("/login?reason=session-expired");
      });
    return () => {
      alive = false;
    };
  }, [router]);
  if (state === "checking")
    return (
      <main className="session-loading" aria-live="polite">
        Checking your secure session…
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
