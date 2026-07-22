import Link from "next/link";
import { RegisterForm } from "../../../components/auth-forms";

export default function RegisterPage() {
  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          Start your workspace
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Set up your document operations.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Create the first owner account for your agency workspace.
        </p>
      </header>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          className="font-semibold text-primary hover:text-primary-hover"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
