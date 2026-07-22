import Link from "next/link";
import { RegisterForm } from "../../../components/auth-forms";
export default function RegisterPage() {
  return (
    <>
      <header className="auth-card__header">
        <p className="eyebrow">Start a workspace</p>
        <h1>Documents with a memory.</h1>
        <p>Create the first owner account for your agency workspace.</p>
      </header>
      <RegisterForm />
      <p className="form-foot">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
