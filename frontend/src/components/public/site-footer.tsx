import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-brand py-10 text-white sm:py-14">
      <div className="public-container grid gap-10 md:grid-cols-[1.4fr_1fr_1fr] md:items-start">
        <div className="max-w-md">
          <Logo className="h-10 text-white" />
          <p className="mt-5 text-sm leading-6 text-white/68">
            Local representation and clear property management for Missouri
            buyers, sellers, renters, and owners.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Explore</p>
          <nav
            className="mt-4 grid gap-3 text-sm text-white/68"
            aria-label="Footer navigation"
          >
            <Link className="hover:text-white" href="/properties">
              Properties
            </Link>
            <Link className="hover:text-white" href="/rentals">
              Rentals
            </Link>
            <Link className="hover:text-white" href="/#services">
              Services
            </Link>
            <Link className="hover:text-white" href="/about">
              About Coach Johnson
            </Link>
            <Link className="hover:text-white" href="/about#neyans-place">
              Neyan&apos;s Place story
            </Link>
            <Link className="hover:text-white" href="/contact">
              Contact
            </Link>
            <Link className="hover:text-white" href="/#portal-access">
              Portal access
            </Link>
            <Link className="hover:text-white" href="/privacy">
              Privacy policy
            </Link>
          </nav>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Need help?</p>
          <a
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-white/75"
            href="mailto:info@coachjohnsonrealty.com"
          >
            info@coachjohnsonrealty.com
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
          <p className="mt-6 text-xs leading-5 text-white/58">
            © 2026 Coach Johnson Realty Group. Fair housing and accessibility
            are part of how we work.
          </p>
        </div>
      </div>
    </footer>
  );
}
