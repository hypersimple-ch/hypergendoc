import Link from "next/link";
import { LoginForm } from "../../../components/auth-forms";
import { Status } from "../../../components/primitives";

const verifiedMessage = "Email verified. You can now sign in.";
const invalidVerificationMessage =
  "This verification link is invalid or has expired. Request a new one.";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const status =
    params.error === "invalid_token"
      ? { kind: "error" as const, message: invalidVerificationMessage }
      : params.verified === "true"
        ? { kind: "success" as const, message: verifiedMessage }
        : undefined;

  return (
    <>
      <header className="auth-card__header">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to your workspace.</h1>
      </header>
      {status && <Status kind={status.kind}>{status.message}</Status>}
      <LoginForm />
      <p className="form-foot">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </>
  );
}
