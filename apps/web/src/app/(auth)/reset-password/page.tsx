import { Suspense } from "react";
import { ResetForm } from "../../../components/auth-forms";
export default function ResetPasswordPage() {
  return (
    <>
      <p className="eyebrow">Set a new password</p>
      <h1>Choose a strong new password.</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
