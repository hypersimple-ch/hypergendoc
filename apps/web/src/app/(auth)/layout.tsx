import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <Link className="wordmark" href="/">
        Hyper<span>Gen</span>Doc
      </Link>
      <section className="auth-card">{children}</section>
    </main>
  );
}
