import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-6 text-center">
        <div className="mb-2 text-4xl">🎉</div>
        <h1 className="text-2xl font-bold">Welcome</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Sign in or create an account to get started.
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
