import Link from "next/link";
export default function HomePage() {
  return (
    <main className="landing">
      <nav>
        <span className="wordmark">
          Hyper<span>Gen</span>Doc
        </span>
        <Link className="button button--quiet" href="/login">
          Sign in
        </Link>
      </nav>
      <section className="landing-hero">
        <p className="eyebrow">The agency document desk</p>
        <h1>Make every generated document feel considered.</h1>
        <p>
          HyperGenDoc gives your agents guardrails, your brands a durable
          system, and every rendered version a history.
        </p>
        <div className="hero-actions">
          <Link className="button button--primary" href="/register">
            Create a workspace
          </Link>
          <Link className="text-link" href="/login">
            Enter your desk →
          </Link>
        </div>
      </section>
      <section className="landing-notes">
        <article>
          <b>01</b>
          <h2>Set the system</h2>
          <p>
            Companies and immutable style versions make the visual rules
            explicit.
          </p>
        </article>
        <article>
          <b>02</b>
          <h2>Scope the agent</h2>
          <p>
            Issue an MCP credential that can see and do only what it should.
          </p>
        </article>
        <article>
          <b>03</b>
          <h2>Keep the record</h2>
          <p>Every document version remains a stable, downloadable artifact.</p>
        </article>
      </section>
    </main>
  );
}
