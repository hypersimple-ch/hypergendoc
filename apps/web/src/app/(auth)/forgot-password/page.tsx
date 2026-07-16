import { EmailActionForm } from "../../../components/auth-forms";
export default function ForgotPasswordPage() {
  return (
    <>
      <p className="eyebrow">Account recovery</p>
      <h1>Reset your password.</h1>
      <p>
        We’ll send a secure, single-use reset link if this address has an
        account.
      </p>
      <EmailActionForm kind="forgot" />
    </>
  );
}
