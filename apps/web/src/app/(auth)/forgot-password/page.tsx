import Link from "next/link";
import { EmailActionForm } from "../../../components/auth-forms";

export default function ForgotPasswordPage() {
  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Account recovery
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Reset your password.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          We’ll send a secure, single-use reset link if this address has an
          account.
        </p>
      </header>
      <EmailActionForm kind="forgot" />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          className="font-semibold text-primary hover:text-primary-hover"
          href="/login"
        >
          Return to sign in
        </Link>
      </p>
    </>
  );
}
