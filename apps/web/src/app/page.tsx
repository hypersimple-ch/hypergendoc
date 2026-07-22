import Link from "next/link";
export default function HomePage() {
  return (
    <main id="main-content" className="landing">
      <nav className="landing__nav" aria-label="Primary navigation">
        <span className="wordmark" aria-label="HyperGenDoc">
          Hyper<span>Gen</span>Doc
        </span>
        <Link className="button button--quiet" href="/login">
          Sign in
        </Link>
      </nav>
      <section
        className="landing__hero landing-hero"
        aria-labelledby="landing-title"
      >
        <p className="eyebrow">The agency document desk</p>
        <h1 id="landing-title">
          Govern every brand document your agency generates.
        </h1>
        <p className="landing__lede">
          HyperGenDoc gives your workspace a durable company brand system, clear
          agent access, and a record of every rendered document.
        </p>
        <div className="hero-actions" aria-label="Get started">
          <Link className="button button--primary" href="/register">
            Create a workspace
          </Link>
          <Link className="text-link" href="/login">
            Sign in to your workspace <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
      <section
        className="landing__principles landing-notes"
        aria-labelledby="principles-title"
      >
        <div className="landing__section-heading">
          <p className="eyebrow">A durable production record</p>
          <h2 id="principles-title">
            Make the rules clear before an agent writes.
          </h2>
        </div>
        <ol className="landing__principle-list">
          <li className="landing__principle">
            <span className="landing__principle-number" aria-hidden="true">
              01
            </span>
            <h3>Govern each company brand</h3>
            <p>
              Set a company’s visual system, then retain immutable style
              versions as it evolves.
            </p>
          </li>
          <li className="landing__principle">
            <span className="landing__principle-number" aria-hidden="true">
              02
            </span>
            <h3>Scope MCP access to the agent</h3>
            <p>
              Issue agent-scoped MCP credentials with only the workspace access
              each job requires.
            </p>
          </li>
          <li className="landing__principle">
            <span className="landing__principle-number" aria-hidden="true">
              03
            </span>
            <h3>Audit every generated PDF</h3>
            <p>
              Keep each document version as an auditable, downloadable PDF
              artifact.
            </p>
          </li>
        </ol>
      </section>
    </main>
  );
}
