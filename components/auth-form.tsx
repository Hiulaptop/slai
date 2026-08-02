"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { messageForError, safeNextPath } from "@/lib/auth/auth-client";
import { useAuth } from "@/lib/auth/auth-context";
import { Button, Field, FullPageLoader, StatusMessage } from "./ui";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (auth.status === "authenticated") router.replace("/home");
  }, [auth.status, router]);

  if (auth.status === "loading" || auth.status === "authenticated") {
    return <FullPageLoader label="Checking your session" />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = "Enter a valid email address.";
    if (password.length < 8 || password.length > 128) {
      nextErrors.password = "Password must be between 8 and 128 characters.";
    }
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length) return;

    setPending(true);
    try {
      const credentials = { email: email.trim().toLowerCase(), password };
      if (mode === "login") await auth.login(credentials);
      else await auth.register(credentials);
      router.replace(safeNextPath(searchParams.get("next")));
    } catch (error) {
      setMessage(messageForError(error, mode === "login"
        ? "Unable to log in. Please try again."
        : "Unable to register. Please try again."));
    } finally {
      setPending(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <div>
      <div className="mb-8 space-y-2">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          {isLogin ? "Welcome back" : "New workspace"}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.04em]">
          {isLogin ? "Log in to SLAI" : "Create your account"}
        </h1>
      </div>
      <form className="space-y-5" onSubmit={submit} noValidate>
        <Field id={`${mode}-email`} label="Email" type="email" autoComplete="email" value={email}
          onChange={(event) => setEmail(event.target.value)} error={errors.email} disabled={pending} />
        <Field id={`${mode}-password`} label="Password" type="password"
          autoComplete={isLogin ? "current-password" : "new-password"} value={password}
          onChange={(event) => setPassword(event.target.value)} error={errors.password} disabled={pending} />
        <StatusMessage>{message}</StatusMessage>
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? (isLogin ? "Logging in..." : "Creating account...") : (isLogin ? "Log in" : "Register")}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        {isLogin ? "New to SLAI?" : "Already have an account?"}{" "}
        <Link className="font-medium text-[var(--ink)] underline decoration-stone-400 underline-offset-4" href={isLogin ? "/register" : "/login"}>
          {isLogin ? "Register" : "Log in"}
        </Link>
      </p>
    </div>
  );
}
