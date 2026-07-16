import { EmailActionForm } from "../../../components/auth-forms";
export default function VerifyEmailPage() {
  return (
    <>
      <p className="eyebrow">One last step</p>
      <h1>Verify your email.</h1>
      <p>Your workspace is ready as soon as your address is verified.</p>
      <EmailActionForm kind="verify" />
    </>
  );
}
