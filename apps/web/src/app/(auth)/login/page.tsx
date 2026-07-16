import Link from "next/link";
import { LoginForm } from "../../../components/auth-forms";
export default function LoginPage() {
  return (
    <>
      <p className="eyebrow">Welcome back</p>
      <h1>Sign in to your workspace.</h1>
      <LoginForm />
      <p className="form-foot">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </>
  );
}
