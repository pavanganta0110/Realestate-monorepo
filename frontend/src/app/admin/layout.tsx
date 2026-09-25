"use client";

import { AdminSidebar } from "@/components/admin/sidebar";
import { AuthUser, useAuth } from "@/context/auth-context";
import { navigateToUserPortal } from "@/lib/auth-routing";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const adminRoles: AuthUser["role"][] = [
  "SUPER_ADMIN",
  "SALES_ADMIN",
  "TENANT_ADMIN",
];
const salesRoutePrefixes = [
  "/admin/sales",
  "/admin/agents",
  "/admin/listings",
  "/admin/inquiries",
];
const rentalRoutePrefixes = [
  "/admin/dashboard",
  "/admin/properties",
  "/admin/units",
  "/admin/tenants",
  "/admin/leases",
  "/admin/move-in-inspections",
  "/admin/payments",
  "/admin/owners",
  "/admin/maintenance",
  "/admin/vendors",
  "/admin/messages",
  "/admin/emails",
  "/admin/announcements",
];
const superRoutePrefixes = ["/admin/reports", "/admin/tenant-administrators"];

function matchesRoute(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

function shouldRedirectToPortal(user: AuthUser, pathname: string) {
  if (!adminRoles.includes(user.role)) return true;
  if (
    user.role === "SALES_ADMIN" &&
    matchesRoute(pathname, rentalRoutePrefixes)
  ) {
    return true;
  }
  if (
    user.role === "TENANT_ADMIN" &&
    matchesRoute(pathname, salesRoutePrefixes)
  ) {
    return true;
  }
  return (
    user.role !== "SUPER_ADMIN" && matchesRoute(pathname, superRoutePrefixes)
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";
  const shouldRedirect = user ? shouldRedirectToPortal(user, pathname) : false;
  const isAdmin = Boolean(user && adminRoles.includes(user.role));

  useEffect(() => {
    if (isLoading) return;
    if (isLogin) return;
    if (!user) router.replace("/admin/login");
    else if (shouldRedirect) navigateToUserPortal(router, user, "replace");
  }, [isLoading, isLogin, router, shouldRedirect, user]);

  if (isLogin) return children;

  if (isLoading || !user || !isAdmin || shouldRedirect) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  return (
    <div className="portal-shell min-h-[100dvh] bg-background lg:flex">
      <AdminSidebar />
      <main id="main-content" className="portal-main" data-portal-main>
        {children}
      </main>
    </div>
  );
}
