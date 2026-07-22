import Link from "next/link";
import { Suspense } from "react";
import { ResetForm } from "../../../components/auth-forms";

export default function ResetPasswordPage() {
  return (
    <>
      <header className="auth-card__header">
        <p className="eyebrow">Set a new password</p>
        <h1>Choose a strong new password.</h1>
      </header>
      <Suspense>
        <ResetForm />
      </Suspense>
      <p className="form-foot">
        <Link href="/login">Return to sign in</Link>
      </p>
    </>
  );
}
