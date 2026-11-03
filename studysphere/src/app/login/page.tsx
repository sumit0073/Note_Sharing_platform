"use client";

import { Suspense, useEffect, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { PasswordInput } from "@/components/password-input";
import { TurnstileField } from "@/components/turnstile-field";
import { loginAction } from "./actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const [resetSignal, setResetSignal] = useState(0);
  const [error, action, pending] = useActionState(loginAction, undefined);

  useEffect(() => {
    if (error) setResetSignal((value) => value + 1);
  }, [error]);

  return (
    <>
      <form action={action} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={searchParams.get("next") ?? "/dashboard"} />
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="w-full rounded-xl border border-line bg-paper px-4 py-3"
        />
        <PasswordInput
          name="password"
          required
          placeholder="Password"
          autoComplete="current-password"
        />
        <TurnstileField resetSignal={resetSignal} />
        {error && <p className="text-sm text-terracotta">{error}</p>}
        <button
          disabled={pending}
          className="w-full rounded-full bg-forest py-3 text-white hover:bg-forest-dark disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="mt-6 flex justify-between text-sm text-muted">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/register">Create an account</Link>
      </div>
      {process.env.NODE_ENV !== "production" && (
        <p className="mt-8 rounded-xl bg-leaf p-4 text-sm text-forest-dark">
          Demo: <code>student@studysphere.dev</code> / <code>Student123</code>
        </p>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <section className="mx-auto max-w-md px-4 py-16">
      <div className="mb-8 flex justify-center">
        <BrandLogo size="lg" showTagline align="center" />
      </div>
      <h1 className="font-serif text-4xl">Welcome back</h1>
      <p className="mt-2 text-muted">Sign in to upload, bookmark, and rate notes.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </section>
  );
}
