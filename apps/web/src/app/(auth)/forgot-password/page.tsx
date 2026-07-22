import Link from "next/link";
import { EmailActionForm } from "../../../components/auth-forms";

export default function ForgotPasswordPage() {
  return (
    <>
      <header className="auth-card__header">
        <p className="eyebrow">Account recovery</p>
        <h1>Reset your password.</h1>
        <p>
          We’ll send a secure, single-use reset link if this address has an
          account.
        </p>
      </header>
      <EmailActionForm kind="forgot" />
      <p className="form-foot">
        Remembered it? <Link href="/login">Return to sign in</Link>
      </p>
    </>
  );
}
