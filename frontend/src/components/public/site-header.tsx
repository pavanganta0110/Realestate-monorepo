"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/properties", label: "Properties" },
  { href: "/rentals", label: "Rentals" },
  { href: "/#services", label: "Services" },
  { href: "/about", label: "About Coach Johnson" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40 border-b border-white/10 bg-brand py-3 text-white"
      style={{ viewTransitionName: "persistent-nav" }}
    >
      <div className="public-container flex min-h-12 items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href="/"
            aria-label="Coach Johnson Realty home"
            onClick={() => setOpen(false)}
            className="inline-flex max-w-full"
          >
            <Logo className="h-9 max-w-full text-white sm:h-10" />
          </Link>
        </div>
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-1 lg:flex"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-4 py-2.5 text-sm font-semibold text-white/72 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/35",
                pathname === item.href && "bg-white/12 text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle className="text-white hover:bg-white/10 hover:text-white" />
          <Button
            nativeButton={false}
            variant="outline"
            className="hidden border-white/35 bg-transparent text-white hover:border-white hover:bg-white hover:text-brand sm:inline-flex"
            render={<Link href="/#portal-access" />}
          >
            Portal sign in
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="border-white/35 bg-transparent text-white hover:border-white hover:bg-white hover:text-brand lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="public-container mt-3 grid gap-1 border-t border-white/15 pt-3 pb-2 lg:hidden"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex min-h-12 items-center rounded-xl px-4 text-base font-semibold text-white/72 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/35",
                pathname === item.href && "bg-white/12 text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
          <Button
            nativeButton={false}
            variant="outline"
            className="mt-2 w-full border-white/35 bg-transparent text-white hover:border-white hover:bg-white hover:text-brand"
            render={
              <Link href="/#portal-access" onClick={() => setOpen(false)} />
            }
          >
            Portal sign in
          </Button>
        </nav>
      )}
    </header>
  );
}
