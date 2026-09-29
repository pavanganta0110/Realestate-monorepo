"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/context/auth-context";
import { navigateToUserPortal } from "@/lib/auth-routing";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";

export function PortalLoginForm({
  eyebrow,
  title,
  description,
  forgotTestId,
  invitationCopy,
  invitationHref,
  invitationLabel,
  portal,
}: {
  eyebrow: string;
  title: string;
  description: string;
  forgotTestId: string;
  invitationCopy: string;
  invitationHref?: string;
  invitationLabel?: string;
  portal: "admin" | "agent" | "tenant";
}) {
  const router = useRouter();
  const { login, user, isLoading: isAuthLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && user) navigateToUserPortal(router, user, "replace");
  }, [isAuthLoading, router, user]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const authenticatedUser = await login(email, password, portal);
      toast.success("Signed in");
      navigateToUserPortal(router, authenticatedUser);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Incorrect email or password"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell eyebrow={eyebrow} title={title} description={description}>
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="portal-email">Email address</Label>
          <Input id="portal-email" name="email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="portal-password">Password</Label>
            <Link href="/auth/forgot-password" transitionTypes={["nav-forward"]} data-testid={forgotTestId} className="rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25">Forgot password?</Link>
          </div>
          <PasswordInput id="portal-password" name="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <Button type="submit" className="mt-1 w-full" disabled={loading || isAuthLoading}>
          {loading ? <><Loader2 className="animate-spin" aria-hidden="true" />Signing in</> : <>Continue<ArrowRight aria-hidden="true" /></>}
        </Button>
      </form>
      <p className="mt-6 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
        {invitationCopy}{invitationHref && invitationLabel ? <> <Link href={invitationHref} transitionTypes={["nav-forward"]} className="font-semibold text-foreground hover:text-primary">{invitationLabel}</Link></> : null}
      </p>
    </AuthShell>
  );
}
