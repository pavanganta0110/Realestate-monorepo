"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { RentalApplicationWorkspace } from "@/components/public/rental-application-workspace";
import { ApplicationFormFields } from "@/components/public/application-form-fields";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import {
  createRentalApplication,
  emptyRentalApplicationForm,
  type RentalApplication,
  type RentalApplicationForm,
} from "@/lib/rental-applications";
import type { RentalProperty } from "@/lib/rental-properties";
import { formatCurrency } from "@/lib/sale-listings";

function RentalApplicationPageContent() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const requestedUnitId = search.get("unitId") ?? undefined;
  const [property, setProperty] = useState<RentalProperty | null>(null);
  const [form, setForm] = useState<RentalApplicationForm>({
    ...emptyRentalApplicationForm,
  });
  const [application, setApplication] = useState<RentalApplication | null>(
    null,
  );
  const [selectedUnitId, setSelectedUnitId] = useState(requestedUnitId ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .get(`/public/rental-properties/${id}`)
      .then((result: RentalProperty) => {
        if (active) setProperty(result);
      })
      .catch((error: unknown) => {
        if (active)
          toast.error(getErrorMessage(error, "Rental is unavailable"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await createRentalApplication(
        id,
        selectedUnitId || undefined,
        form,
      );
      setApplication(result.application);
      window.history.replaceState(
        {},
        "",
        `/rentals/applications/${result.application.id}`,
      );
      toast.success("Application saved. Add your supporting documents next.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to start application"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main
          id="main-content"
          className="flex min-h-[70dvh] items-center justify-center"
        >
          <Loader2
            className="size-7 animate-spin text-primary"
            aria-label="Loading rental"
          />
        </main>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main id="main-content" className="public-container py-20 text-center">
          <h1 className="text-3xl font-semibold">This rental is unavailable</h1>
          <Button
            className="mt-6"
            nativeButton={false}
            render={<Link href="/rentals" />}
          >
            Browse rentals
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main
        id="main-content"
        className="public-container py-8 sm:py-12 lg:py-16"
      >
        <Link
          href={`/rentals/${property.id}`}
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to property
        </Link>
        <div className="mt-7 max-w-3xl">
          <p className="text-sm font-semibold text-primary">
            Rental application
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Apply for {property.name}
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Complete the details, upload the two required document categories,
            and review everything before submitting. Starting an application
            does not reserve the property.
          </p>
          <p className="mt-3 text-sm font-semibold">
            {Number(property.applicationFeeAmount) > 0
              ? `${formatCurrency(Number(property.applicationFeeAmount))} application fee, paid through Stripe only after submission.`
              : "No application fee for this property."}
          </p>
        </div>

        {application ? (
          <div className="mt-10">
            <RentalApplicationWorkspace initialApplication={application} />
          </div>
        ) : (
          <form onSubmit={create} className="mt-10 max-w-4xl">
            {property.units.length > 0 ? (
              <div className="mb-8 max-w-md">
                <label
                  htmlFor="application-unit"
                  className="text-sm font-medium"
                >
                  Available unit
                </label>
                <select
                  id="application-unit"
                  className="mt-2 h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
                  value={selectedUnitId}
                  onChange={(event) => setSelectedUnitId(event.target.value)}
                  required
                >
                  <option value="">Select a unit</option>
                  {property.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      Unit {unit.unitNumber} · $
                      {unit.rentAmount?.toLocaleString() ??
                        "Contact for pricing"}
                      /month
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <ApplicationFormFields form={form} onChange={setForm} />

            <div className="mt-8 flex items-start gap-3 border-t border-border pt-6 text-sm leading-6 text-muted-foreground">
              <LockKeyhole
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p>
                Your application details are private and available only to
                authorized Johnson Realty rental staff. Never enter a Social
                Security number or banking password in this form.
              </p>
            </div>
            <Button className="mt-6" type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Save and continue to documents
            </Button>
          </form>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default function RentalApplicationPage() {
  return (
    <Suspense>
      <RentalApplicationPageContent />
    </Suspense>
  );
}
