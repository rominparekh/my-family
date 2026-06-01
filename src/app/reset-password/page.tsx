import { Suspense } from "react";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-6 text-center">
        <div className="mb-2 text-4xl">🔒</div>
        <h1 className="text-2xl font-bold">Choose a new password</h1>
      </div>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
