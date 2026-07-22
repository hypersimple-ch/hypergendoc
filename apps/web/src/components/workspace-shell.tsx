"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  FileStack,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { ApiError, workspaceApi } from "../lib/api-client";
import { authClient } from "../lib/auth-client";
import { ActiveCompanyProvider, useActiveCompany } from "./active-company";
import { Select } from "./primitives";

const navigationGroups = [
  {
    label: "Workspace",
    links: [{ href: "/workspace", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Content",
    links: [
      { href: "/workspace/companies", label: "Companies", icon: Building2 },
      { href: "/workspace/styles", label: "Styles", icon: Palette },
      { href: "/workspace/documents", label: "Documents", icon: FileStack },
    ],
  },
  {
    label: "Administration",
    links: [
      { href: "/workspace/members", label: "Members", icon: Users },
      { href: "/workspace/credentials", label: "MCP access", icon: KeyRound },
      { href: "/workspace/audit", label: "Audit log", icon: ScrollText },
    ],
  },
] as const;

export function SessionBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<
    "checking" | "ready" | "error" | "ambiguous"
  >("checking");
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
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
        if (caught instanceof ApiError && caught.code === "conflict") {
          setState("ambiguous");
          return;
        }
        setError("We could not verify workspace access.");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [attempt, pathname, router]);
  if (state === "checking")
    return (
      <main id="main-content" className="session-loading" aria-live="polite">
        Checking your secure session…
      </main>
    );
  if (state === "ambiguous")
    return (
      <main id="main-content" className="session-loading" role="alert">
        <p>Your account has memberships in multiple workspaces.</p>
        <p>
          Ask your workspace administrator to resolve the duplicate memberships,
          then try again.
        </p>
        <Button
          onClick={() => {
            setState("checking");
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </main>
    );
  if (state === "error")
    return (
      <main id="main-content" className="session-loading" role="alert">
        <p>{error ?? "We could not verify workspace access."}</p>
        <p>Please check your connection and try again.</p>
        <Button
          onClick={() => {
            setError(undefined);
            setState("checking");
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </main>
    );
  return <>{children}</>;
}

export function WorkspaceSetupBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "error">(
    "checking",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    workspaceApi
      .current()
      .then(() => {
        if (alive) router.replace("/workspace");
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && caught.code === "unauthenticated") {
          router.replace("/login?next=%2Fsetup");
          return;
        }
        if (caught instanceof ApiError && caught.code === "forbidden") {
          setState("ready");
          return;
        }
        if (caught instanceof ApiError && caught.code === "conflict") {
          router.replace("/workspace");
          return;
        }
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [attempt, router]);

  if (state === "checking")
    return <p role="status">Checking your secure session…</p>;
  if (state === "error")
    return (
      <div className="space-y-4" role="alert">
        <p>We could not verify whether this account needs a workspace.</p>
        <Button
          onClick={() => {
            setState("checking");
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  return <>{children}</>;
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <ActiveCompanyProvider>
      <WorkspaceShellContent>{children}</WorkspaceShellContent>
    </ActiveCompanyProvider>
  );
}

function WorkspaceShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    context,
    companies,
    loading,
    error,
    reload,
    activeCompany,
    setActiveCompany,
    noActiveCompany,
  } = useActiveCompany();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const [signOutState, setSignOutState] = useState<
    "idle" | "pending" | "error"
  >("idle");
  async function signOut() {
    setSignOutState("pending");
    try {
      await authClient.signOut();
      router.replace("/login");
    } catch {
      setSignOutState("error");
    }
  }

  function closeMenu(returnFocus = false) {
    setOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  }

  useEffect(() => {
    if (!open) return;
    const navigationControls = Array.from(
      navigationRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), select:not([disabled])",
      ) ?? [],
    );
    navigationControls[0]?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key !== "Tab" || !navigationControls.length) return;
      const first = navigationControls[0];
      const last = navigationControls.at(-1);
      if (!first || !last) return;
      if (document.activeElement === menuButtonRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        menuButtonRef.current?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="workspace-shell">
      <header
        className={`workspace-top workspace-shell__header ${open ? "workspace-top--menu-open" : ""}`}
      >
        <Link
          href="/workspace"
          className="wordmark workspace-brand"
          tabIndex={open ? -1 : undefined}
          aria-label="HyperGenDoc overview"
        >
          <span className="workspace-brand__mark" aria-hidden="true">
            H
          </span>
          <span className="workspace-brand__name">HyperGenDoc</span>
        </Link>
        <section
          className="workspace-context"
          aria-label="Active workspace context"
          hidden={open}
        >
          <div className="workspace-context__identity">
            <span className="workspace-label">Current workspace</span>
            <strong>{context?.name ?? "Workspace"}</strong>
          </div>
          <div className="workspace-company-selector workspace-context__company">
            <label htmlFor="active-company">Active company</label>
            {loading ? <p role="status">Loading companies…</p> : null}
            {error ? (
              <div role="alert">
                <p>We could not load companies. {error}</p>
                <button onClick={reload}>Try again</button>
              </div>
            ) : null}
            {noActiveCompany ? (
              <p role="status">
                No active companies are available. Create or restore a company
                to continue.
              </p>
            ) : null}
            {!loading && !error && !noActiveCompany ? (
              <Select
                id="active-company"
                aria-label="Active company"
                value={activeCompany?.id ?? ""}
                onValueChange={setActiveCompany}
                options={companies
                  .filter((company) => !company.archivedAt)
                  .map((company) => ({
                    value: company.id,
                    label: company.name,
                  }))}
                placeholder="Select a company"
              />
            ) : null}
            <Link
              className="workspace-context__action"
              href="/workspace/companies"
            >
              Manage companies
            </Link>
          </div>
        </section>
        <button
          ref={menuButtonRef}
          className="menu-button"
          aria-expanded={open}
          aria-controls="workspace-navigation"
          aria-label={
            open ? "Close workspace navigation" : "Open workspace navigation"
          }
          onClick={() => (open ? closeMenu(true) : setOpen(true))}
        >
          <Menu size={18} aria-hidden="true" />
          <span>Menu</span>
        </button>
        <button
          className="avatar"
          aria-label="Sign out"
          title="Sign out"
          disabled={open || signOutState === "pending"}
          onClick={() => void signOut()}
        >
          {signOutState === "pending" ? (
            <span aria-hidden="true">…</span>
          ) : (
            <LogOut size={17} aria-hidden="true" />
          )}
        </button>
        {signOutState === "error" ? (
          <p role="alert">Sign out failed. Please try again.</p>
        ) : null}
      </header>
      <aside
        ref={navigationRef}
        id="workspace-navigation"
        className={`sidebar workspace-navigation ${open ? "sidebar--open" : ""}`}
        aria-label="Workspace navigation"
      >
        <nav aria-label="Workspace sections">
          {navigationGroups.map((group) => (
            <section className="workspace-navigation__group" key={group.label}>
              <h2 className="workspace-navigation__heading">{group.label}</h2>
              <ul>
                {group.links.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={pathname === href ? "page" : undefined}
                      onClick={() => closeMenu()}
                    >
                      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={16} aria-hidden="true" />
          <p>Permissions are verified by the server for every request.</p>
        </div>
      </aside>
      <main
        id="main-content"
        className="workspace-main workspace-shell__main"
        inert={open ? true : undefined}
      >
        {children}
      </main>
    </div>
  );
}
