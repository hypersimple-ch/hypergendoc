import Link from "next/link";
import { Suspense } from "react";
import { ResetForm } from "../../../components/auth-forms";

export default function ResetPasswordPage() {
  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Set a new password
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Choose a strong new password.
        </h1>
      </header>
      <Suspense>
        <ResetForm />
      </Suspense>
      <p className="mt-6 text-center text-sm">
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
