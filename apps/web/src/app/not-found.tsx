import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="grid min-h-screen place-items-center p-6"
    >
      <section className="panel feature-state max-w-lg">
        <p className="eyebrow">404</p>
        <h1>We could not find that page.</h1>
        <p>Check the address or return to the HyperGenDoc home page.</p>
        <Link className="button inline-flex" href="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
