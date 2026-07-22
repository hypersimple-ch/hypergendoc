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
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Welcome back
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Sign in to your workspace.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Manage the brands, access, and documents your team relies on.
        </p>
      </header>
      {status && (
        <div className="mb-5">
          <Status kind={status.kind}>{status.message}</Status>
        </div>
      )}
      <LoginForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          className="font-semibold text-primary hover:text-primary-hover"
          href="/register"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
