"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/logo";
import {
  ProductTour,
  type ProductTourStep,
  useProductTour,
} from "@/components/portal/product-tour";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PortalNavItem = {
  title: string;
  icon: LucideIcon;
  href: string;
  group?: string;
  matchNested?: boolean;
  badge?: number;
};

export function PortalSidebar({
  items,
  portalName,
  userName,
  userRole,
  initials,
  onLogout,
  tourId,
  tourSteps,
}: {
  items: PortalNavItem[];
  portalName: string;
  userName: string;
  userRole: string;
  initials: string;
  onLogout: () => void | Promise<void>;
  tourId: string;
  tourSteps: ProductTourStep[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tour = useProductTour(
    `coach-johnson-realty:product-tour:${tourId}:v1`,
  );
  const groupedItems = items.reduce<
    Array<{ title: string; items: PortalNavItem[] }>
  >((groups, item) => {
    const title = item.group || "Navigation";
    const existing = groups.find((group) => group.title === title);
    if (existing) existing.items.push(item);
    else groups.push({ title, items: [item] });
    return groups;
  }, []);
  const showGroupTitles =
    groupedItems.length > 1 || items.some((item) => item.group);

  const nav = (
    <nav className="grid gap-5" aria-label={`${portalName} navigation`}>
      {groupedItems.map((group) => (
        <section key={group.title} className="grid gap-1" aria-label={group.title}>
          {showGroupTitles && (
            <p className="mb-1 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/50">
              {group.title}
            </p>
          )}
          {group.items.map((item) => {
            const active =
              pathname === item.href ||
              (item.matchNested !== false && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/25",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/68 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                aria-current={active ? "page" : undefined}
                aria-label={
                  item.badge
                    ? `${item.title}, ${item.badge} new item${item.badge === 1 ? "" : "s"}`
                    : undefined
                }
              >
                <item.icon
                  className="size-[1.125rem] shrink-0"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span className="truncate">{item.title}</span>
                {item.badge ? (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[0.6875rem] font-bold leading-none text-destructive-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </section>
      ))}
    </nav>
  );
  const tourButton = (
    <Button
      type="button"
      variant="ghost"
      className="min-h-11 w-full justify-start gap-3 px-3.5 text-sidebar-foreground/68 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      onClick={tour.restart}
    >
      <Compass
        className="size-[1.125rem]"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      Take a tour
    </Button>
  );

  return (
    <>
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar/96 px-3 backdrop-blur-xl sm:px-4 lg:hidden" style={{ viewTransitionName: "persistent-nav" }}>
        <div className="min-w-0 flex-1">
          <Logo className="h-8 max-w-full text-sidebar-foreground" />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button type="button" variant="ghost" size="icon" aria-label={open ? "Close portal navigation" : "Open portal navigation"} aria-expanded={open} aria-controls="portal-mobile-navigation" onClick={() => setOpen((value) => !value)}>
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </header>
      {open && (
        <div id="portal-mobile-navigation" className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-sidebar-border bg-sidebar px-4 py-4 lg:hidden">
          <p className="mb-3 px-3 text-xs font-semibold text-sidebar-foreground/60">{portalName}</p>
          {nav}
          <div className="mt-4 border-t border-sidebar-border pt-4">
            {tourButton}
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border px-3 pt-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">{initials}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-sidebar-foreground">{userName}</p><p className="truncate text-xs text-sidebar-foreground/58">{userRole}</p></div>
            <Button type="button" variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out"><LogOut aria-hidden="true" /></Button>
          </div>
        </div>
      )}
      <aside className="hidden h-[100dvh] w-[17.5rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:flex" style={{ viewTransitionName: "persistent-nav" }}>
        <div className="px-6 pt-7 pb-6"><Logo className="h-9 text-sidebar-foreground" /></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <p className="mb-3 px-3 text-xs font-semibold text-sidebar-foreground/58">
            {portalName}
          </p>
          {nav}
          <div className="mt-5 border-t border-sidebar-border pt-4">
            {tourButton}
          </div>
        </div>
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-sidebar-accent/65 p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">{initials}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-sidebar-foreground">{userName}</p><p className="truncate text-xs text-sidebar-foreground/58">{userRole}</p></div>
            <Button type="button" variant="ghost" size="icon" className="size-10" onClick={onLogout} aria-label="Sign out"><LogOut aria-hidden="true" /></Button>
          </div>
        </div>
      </aside>
      <ProductTour
        key={tour.runId}
        portalName={portalName}
        steps={tourSteps}
        open={tour.open}
        onOpenChange={tour.setOpen}
        onComplete={tour.close}
      />
    </>
  );
}
