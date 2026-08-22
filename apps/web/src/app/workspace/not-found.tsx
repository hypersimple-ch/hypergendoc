import Link from "next/link";

export default function WorkspaceNotFound() {
  return (
    <section className="panel feature-state">
      <p className="eyebrow">Not found</p>
      <h1>This workspace item is unavailable.</h1>
      <p>It may have been removed, archived, or belong to another workspace.</p>
      <Link className="button inline-flex" href="/workspace">
        Return to overview
      </Link>
    </section>
  );
}
