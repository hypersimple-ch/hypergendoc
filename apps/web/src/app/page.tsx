import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileCheck2,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

const capabilities = [
  {
    icon: ShieldCheck,
    title: "Brand control, built in",
    copy: "Turn each company’s brand rules into a durable system your team can trust.",
  },
  {
    icon: KeyRound,
    title: "Scoped agent access",
    copy: "Give every agent only the workspace access its job requires.",
  },
  {
    icon: FileCheck2,
    title: "A complete document record",
    copy: "Keep rendered PDFs, versions, and the decisions behind them in one place.",
  },
];

export default function HomePage() {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-background text-foreground"
    >
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8"
        aria-label="Primary navigation"
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
          aria-label="HyperGenDoc home"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            H
          </span>
          <span>
            Hyper<span className="text-primary">Gen</span>Doc
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block"
            href="/login"
          >
            Sign in
          </Link>
          <Link
            className="rounded-lg bg-inverse px-3.5 py-2 text-sm font-medium text-inverse-foreground shadow-sm transition hover:bg-secondary-foreground"
            href="/register"
          >
            Get started
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-16">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent-foreground">
            Document operations, simplified
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl lg:text-6xl">
            Every approved document starts with a system.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            HyperGenDoc gives agencies one clear place to govern brands,
            coordinate agent access, and retain every generated document.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
              href="/register"
            >
              Create your workspace{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:border-input hover:bg-muted"
              href="/login"
            >
              Sign in to your workspace
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="size-4 text-primary" aria-hidden="true" /> Built
            for accountable agency operations
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-xl shadow-graphite-950/5 sm:p-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <p className="text-sm font-semibold">Production overview</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Current workspace activity
              </p>
            </div>
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              All systems clear
            </span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              ["12", "Companies"],
              ["38", "Documents"],
              ["4", "Active agents"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl bg-muted p-3">
                <p className="text-xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Latest approved output</p>
              <span className="text-xs font-medium text-primary">Ready</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-muted">
                <FileCheck2
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="text-sm font-medium">Q3 Brand Narrative.pdf</p>
                <p className="text-xs text-muted-foreground">
                  Northstar · Version 3
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Designed for the handoff
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
              From brand rule to final artifact, nothing gets lost.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, copy }) => (
              <article
                key={title}
                className="rounded-xl border border-border p-5"
              >
                <div className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-inverse px-6 py-9 text-inverse-foreground sm:flex-row sm:items-center sm:px-10">
          <div>
            <p className="text-sm font-medium text-inverse-accent">
              A clearer way to operate
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Put your document system to work.
            </h2>
          </div>
          <Link
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
            href="/register"
          >
            Create a workspace{" "}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
