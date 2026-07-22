import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="auth-page">
      <header className="auth-page__masthead">
        <Link className="wordmark" href="/" aria-label="HyperGenDoc home">
          Hyper<span>Gen</span>Doc
        </Link>
        <p className="auth-page__context">Agency document governance</p>
      </header>
      <section className="auth-card" aria-label="Account access">
        <div className="auth-card__content">{children}</div>
      </section>
    </main>
  );
}
