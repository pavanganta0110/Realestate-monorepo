"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { api } from "@/lib/api";
import { toast } from "sonner";

const initialForm = { firstName: "", lastName: "", email: "" };

type StaffAccount = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: "SUPER_ADMIN" | "SALES_ADMIN" | "TENANT_ADMIN";
  status: "INVITED" | "ACTIVE" | "DISABLED";
  createdAt: string;
  lastSignInAt: string | null;
};

function roleLabel(role: StaffAccount["role"]) {
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export default function TenantAdministratorsPage() {
  const [form, setForm] = useState(initialForm);
  const [inviting, setInviting] = useState(false);
  const invitingRef = useRef(false);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  const loadStaff = useCallback(async () => {
    setLoadingStaff(true);
    try {
      setStaff(await api.get("/auth/tenant-administrators"));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to load staff accounts"));
    } finally {
      setLoadingStaff(false);
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const inviteTenantAdministrator = async (event: FormEvent) => {
    event.preventDefault();
    if (invitingRef.current) return;

    invitingRef.current = true;
    setInviting(true);
    try {
      await api.post("/auth/tenant-admin-invite", form);
      toast.success("Tenant administrator invitation sent");
      setForm(initialForm);
      await loadStaff();
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Unable to invite tenant administrator"),
      );
    } finally {
      invitingRef.current = false;
      setInviting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 sm:space-y-10">
      <div>
        <p className="text-sm font-semibold text-primary">Super Admin only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Tenant administrators
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Invite a trusted staff member to manage rental operations. They will
          receive a one-time secure link to set their password and access the
          rental administration portal.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            Invite a tenant administrator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5" onSubmit={inviteTenantAdministrator}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tenant-admin-first-name">First name</Label>
                <Input
                  id="tenant-admin-first-name"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      firstName: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tenant-admin-last-name">Last name</Label>
                <Input
                  id="tenant-admin-last-name"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      lastName: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tenant-admin-email">Work email</Label>
              <Input
                id="tenant-admin-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={inviting}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              {inviting
                ? "Sending invitation…"
                : "Send administrator invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Staff accounts and roles</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              See who has been invited, which role they have, and whether they
              have signed in.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadStaff()}
            disabled={loadingStaff}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loadingStaff ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : staff.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No staff accounts found.
            </p>
          ) : (
            <div className="grid gap-3">
              {staff.map((account) => {
                const displayName = [account.firstName, account.lastName]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div
                    key={account.id}
                    className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">
                        {displayName || account.email}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {account.email}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">{roleLabel(account.role)}</Badge>
                      <Badge
                        className={
                          account.status === "ACTIVE"
                            ? "bg-primary/10 text-primary hover:bg-primary/20"
                            : "bg-secondary text-muted-foreground hover:bg-secondary"
                        }
                      >
                        {account.status === "INVITED"
                          ? "Invitation pending"
                          : account.status.charAt(0) + account.status.slice(1).toLowerCase()}
                      </Badge>
                      <span className="text-muted-foreground">
                        {account.lastSignInAt
                          ? `Last sign-in ${new Date(account.lastSignInAt).toLocaleDateString()}`
                          : "Not signed in yet"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
