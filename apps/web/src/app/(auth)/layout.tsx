import Link from "next/link";
import { CheckCircle2, FileCheck2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-2"
    >
      <section className="hidden bg-inverse p-10 text-inverse-foreground lg:flex lg:flex-col lg:justify-between xl:p-14">
        <Link
          href="/"
          className="flex items-center gap-2.5 self-start font-semibold tracking-tight"
          aria-label="HyperGenDoc home"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            H
          </span>
          <span>
            Hyper<span className="text-inverse-accent">Gen</span>Doc
          </span>
        </Link>
        <div className="max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-inverse-accent">
            Document operations
          </p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
            The source of truth for every agency document.
          </h2>
          <p className="mt-5 leading-7 text-inverse-muted">
            Bring brand standards, agent access, and production history into one
            accountable workspace.
          </p>
          <ul className="mt-9 space-y-4 text-sm text-inverse-muted">
            <li className="flex gap-3">
              <ShieldCheck
                className="size-5 shrink-0 text-inverse-accent"
                aria-hidden="true"
              />
              Govern brands with confidence
            </li>
            <li className="flex gap-3">
              <FileCheck2
                className="size-5 shrink-0 text-inverse-accent"
                aria-hidden="true"
              />
              Keep a durable document record
            </li>
            <li className="flex gap-3">
              <CheckCircle2
                className="size-5 shrink-0 text-inverse-accent"
                aria-hidden="true"
              />
              Know what is ready to ship
            </li>
          </ul>
        </div>
        <p className="text-sm text-inverse-muted">
          HyperGenDoc · Agency document governance
        </p>
      </section>
      <section className="flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:items-center lg:justify-center lg:p-10">
        <header className="flex items-center justify-between lg:hidden">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
            aria-label="HyperGenDoc home"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              H
            </span>
            <span>
              Hyper<span className="text-primary">Gen</span>Doc
            </span>
          </Link>
          <Link href="/" className="text-sm font-medium text-muted-foreground">
            Home
          </Link>
        </header>
        <section
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12 lg:flex-none lg:py-0"
          aria-label="Account access"
        >
          <div className="rounded-2xl border border-border bg-card p-6 shadow-lg shadow-graphite-950/5 sm:p-8">
            <div className="auth-card__content">{children}</div>
          </div>
        </section>
        <footer className="text-center text-xs text-muted-foreground lg:hidden">
          Agency document governance
        </footer>
      </section>
    </main>
  );
}
