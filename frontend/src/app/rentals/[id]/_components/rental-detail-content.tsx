import Link from "next/link";
import {
  Bath,
  BedDouble,
  CalendarDays,
  CalendarCheck2,
  Check,
  CircleDollarSign,
  ClipboardPenLine,
  Clock3,
  Home,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Ruler,
  ShieldCheck,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { rentalPrice, type RentalProperty } from "@/lib/rental-properties";
import { formatCurrency } from "@/lib/sale-listings";

type RentalDetailContentProps = {
  property: RentalProperty;
};

const rentalDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const supportItems = [
  {
    icon: MessageSquareText,
    title: "Direct answers",
    description: "Ask about availability and terms.",
  },
  {
    icon: Home,
    title: "Property guidance",
    description: "Discuss tours and the next step.",
  },
  {
    icon: ShieldCheck,
    title: "Fair process",
    description: "Clear communication for every renter.",
  },
];

function display(value: number | null | undefined, fallback = "Ask our team") {
  return value == null ? fallback : value.toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return rentalDateFormatter.format(date);
}

function PropertyFacts({ property }: RentalDetailContentProps) {
  const unit = property.units[0];
  const availability = formatDate(
    unit?.availableDate ?? property.availabilityDate,
  );
  const facts = [
    {
      label: "Bedrooms",
      value: display(unit?.bedrooms ?? property.bedrooms),
      icon: BedDouble,
    },
    {
      label: "Bathrooms",
      value: display(unit?.bathrooms ?? property.bathrooms),
      icon: Bath,
    },
    {
      label: "Square feet",
      value: display(unit?.squareFeet ?? property.squareFeet),
      icon: Ruler,
    },
    {
      label: "Availability",
      value:
        property.status === "rented" ? "Rented" : (availability ?? "Ask us"),
      icon: CalendarDays,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-6 border-y border-border py-6 sm:grid-cols-4 sm:py-7">
      {facts.map(({ label, value, icon: Icon }) => (
        <div key={label}>
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon
              className="size-4 text-primary"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            {label}
          </dt>
          <dd className="mt-2 text-lg font-semibold tracking-[-0.02em]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AvailableUnits({ property }: RentalDetailContentProps) {
  if (property.units.length === 0) return null;

  return (
    <section className="border-t border-border pt-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.035em]">
            Available units
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Current rent and deposit details from the rental team.
          </p>
        </div>
        <span className="text-sm font-semibold text-primary">
          {property.units.length}{" "}
          {property.units.length === 1 ? "unit" : "units"}
        </span>
      </div>
      <div className="mt-6 overflow-hidden rounded-[1.25rem] border border-border bg-card">
        {property.units.map((unit, index) => (
          <div
            key={unit.id}
            className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"
            style={
              index > 0 ? { borderTop: "1px solid var(--border)" } : undefined
            }
          >
            <div>
              <h3 className="font-semibold">
                {unit.unitNumber ? `Unit ${unit.unitNumber}` : "Available home"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {unit.bedrooms ?? "Ask"} bed, {unit.bathrooms ?? "Ask"} bath,{" "}
                {unit.squareFeet?.toLocaleString() ?? "Ask"} sq ft
                {formatDate(unit.availableDate)
                  ? `, available ${formatDate(unit.availableDate)}`
                  : ""}
              </p>
              {unit.amenities.length > 0 ? (
                <ul
                  className="mt-3 flex flex-wrap gap-2"
                  aria-label={`Features for unit ${unit.unitNumber}`}
                >
                  {unit.amenities.map((amenity) => (
                    <li
                      key={amenity}
                      className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground"
                    >
                      {amenity}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="sm:text-right">
              <p className="text-lg font-semibold">
                {unit.rentAmount == null
                  ? "Contact for pricing"
                  : `${formatCurrency(unit.rentAmount)} / month`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {unit.depositAmount == null
                  ? "Deposit to be confirmed"
                  : `${formatCurrency(unit.depositAmount)} deposit`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InquiryPanel({ property }: RentalDetailContentProps) {
  const rented = property.status === "rented";
  const unit = property.units[0];
  const price = rentalPrice(property);
  const canApply = !rented && price != null;
  const availability = formatDate(
    unit?.availableDate ?? property.availabilityDate,
  );
  const address = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
  const contactHref = (intent: string) => {
    const search = new URLSearchParams({
      intent,
      rentalId: property.id,
      property: property.name,
      address,
    });
    if (unit) search.set("unitId", unit.id);
    return `/contact?${search.toString()}`;
  };

  return (
    <aside
      id="rental-inquiry"
      className="scroll-mt-28 lg:col-start-2 lg:row-span-2 lg:row-start-1"
    >
      <div className="rounded-[1.25rem] border border-border bg-card p-6 lg:sticky lg:top-24 lg:p-7">
        <p className="text-sm font-semibold text-primary">
          {rented ? "Rental history" : "Current availability"}
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">
          {rented ? "This home has been rented" : "Ask about this home"}
        </h2>
        <p className="mt-4 text-3xl font-semibold tracking-[-0.045em]">
          {price == null ? "Contact for pricing" : formatCurrency(price)}
          {price != null ? (
            <span className="ml-1 text-base font-medium tracking-normal text-muted-foreground">
              / month
            </span>
          ) : null}
        </p>

        {!rented ? (
          <dl className="mt-6 space-y-4 border-y border-border py-5 text-sm">
            <div className="flex items-start justify-between gap-5">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="size-4 text-primary" aria-hidden="true" />
                Available
              </dt>
              <dd className="text-right font-semibold">
                {availability ?? "Confirm with team"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-5">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <CircleDollarSign
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                Deposit
              </dt>
              <dd className="text-right font-semibold">
                {unit?.depositAmount != null
                  ? formatCurrency(unit.depositAmount)
                  : "Confirm with team"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-5">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <ClipboardPenLine
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                Application fee
              </dt>
              <dd className="text-right font-semibold">
                {Number(property.applicationFeeAmount) > 0
                  ? formatCurrency(Number(property.applicationFeeAmount))
                  : "No fee"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            We can help you compare current rentals with similar features.
          </p>
        )}

        {rented ? (
          <Link
            href={contactHref("similar-rental")}
            transitionTypes={["nav-forward"]}
            className={buttonVariants({ className: "mt-6 w-full" })}
          >
            Find a similar rental
          </Link>
        ) : (
          <div className="mt-6 grid gap-3">
            {canApply ? (
              <Link
                href={`/rentals/${property.id}/apply${unit ? `?unitId=${encodeURIComponent(unit.id)}` : ""}`}
                transitionTypes={["nav-forward"]}
                className={buttonVariants({ className: "w-full" })}
              >
                <ClipboardPenLine aria-hidden="true" />
                Apply now
              </Link>
            ) : null}
            <Link
              href={contactHref("rent-tour")}
              transitionTypes={["nav-forward"]}
              className={buttonVariants({
                variant: canApply ? "outline" : "default",
                className: "w-full",
              })}
            >
              <CalendarCheck2 aria-hidden="true" />
              Schedule a tour
            </Link>
            <Link
              href={contactHref("rent")}
              transitionTypes={["nav-forward"]}
              className={buttonVariants({
                variant: "ghost",
                className: "w-full",
              })}
            >
              <MessageCircle aria-hidden="true" />
              Contact rental team
            </Link>
          </div>
        )}
        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
          {rented
            ? "No payment is required to ask about similar rentals."
            : canApply
              ? "No payment is required to ask, tour, or start an application."
              : "No payment is required to ask a question or request a tour."}
        </p>

        <div className="mt-6 border-t border-border pt-6">
          <h3 className="text-sm font-semibold">What happens next</h3>
          <ol className="mt-4 space-y-4 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-semibold text-primary">1.</span>
              Choose whether to apply, request a tour, or ask a question.
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-primary">2.</span>
              The rental team confirms availability and explains the next step.
            </li>
          </ol>
        </div>
      </div>
    </aside>
  );
}

export function RentalDetailHeader({ property }: RentalDetailContentProps) {
  const rented = property.status === "rented";
  const price = rentalPrice(property);

  return (
    <header className="grid gap-6 pb-7 pt-5 sm:pb-8 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <span className="text-primary">
            {property.propertyType || "Rental home"}
          </span>
          <span
            className="rounded-full bg-secondary px-3 py-1.5 text-secondary-foreground"
            aria-label={`Status: ${rented ? "rented" : "available"}`}
          >
            {rented ? "Rented" : "Available"}
          </span>
        </div>
        <h1 className="mt-3 max-w-4xl text-[clamp(2.75rem,6vw,5.5rem)] font-semibold leading-[0.96] tracking-[-0.055em]">
          {property.name}
        </h1>
        <p className="mt-5 flex max-w-2xl items-start gap-2 text-base leading-7 text-muted-foreground">
          <MapPin
            className="mt-1 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          {property.address}, {property.city}, {property.state} {property.zip}
        </p>
      </div>
      <div className="lg:pb-1 lg:text-right">
        <p className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
          {price == null ? "Pricing on request" : formatCurrency(price)}
        </p>
        {price != null ? (
          <p className="mt-1 text-sm text-muted-foreground">per month</p>
        ) : null}
      </div>
    </header>
  );
}

export function RentalDetailContent({ property }: RentalDetailContentProps) {
  return (
    <div className="pb-16 pt-8 sm:pb-24 sm:pt-10 lg:pb-28">
      <PropertyFacts property={property} />

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_23.5rem] lg:gap-16">
        <article className="min-w-0 space-y-10">
          <section>
            <h2 className="text-2xl font-semibold tracking-[-0.035em]">
              About this property
            </h2>
            <p className="mt-4 max-w-[70ch] whitespace-pre-line text-base leading-8 text-muted-foreground">
              {property.description ||
                "Our property team can share lease details, availability, and the complete story of this home."}
            </p>
          </section>

          {property.amenities.length > 0 ? (
            <section className="border-t border-border pt-9">
              <h2 className="text-2xl font-semibold tracking-[-0.035em]">
                Home features
              </h2>
              <ul className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {property.amenities.map((amenity) => (
                  <li
                    key={amenity}
                    className="flex items-start gap-3 text-sm leading-6"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                      <Check
                        className="size-3.5"
                        strokeWidth={2.2}
                        aria-hidden="true"
                      />
                    </span>
                    {amenity}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {property.utilityInfo ? (
            <section className="border-t border-border pt-9">
              <h2 className="text-2xl font-semibold tracking-[-0.035em]">
                Utilities and lease details
              </h2>
              <p className="mt-4 max-w-[70ch] whitespace-pre-line text-base leading-8 text-muted-foreground">
                {property.utilityInfo}
              </p>
            </section>
          ) : null}

          <AvailableUnits property={property} />
        </article>

        <InquiryPanel property={property} />
      </div>

      <section className="mt-16 overflow-hidden rounded-[1.5rem] bg-brand px-6 py-9 text-white sm:px-10 sm:py-11 lg:mt-24 lg:grid lg:grid-cols-[1fr_1.25fr] lg:items-center lg:gap-16 lg:px-12">
        <div>
          <p className="text-sm font-semibold text-white/70">
            Local rental support
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Clear help from inquiry to move-in.
          </h2>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-3 lg:mt-0">
          {supportItems.map(({ icon: Icon, title, description }) => (
            <div key={title}>
              <Icon
                className="size-5 text-white/75"
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/68">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
