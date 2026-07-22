import { EmailActionForm } from "../../../components/auth-forms";

export default function VerifyEmailPage() {
  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          One last step
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Verify your email.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your workspace is ready as soon as your address is verified.
        </p>
      </header>
      <EmailActionForm kind="verify" />
    </>
  );
}
