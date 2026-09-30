"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  Calendar,
  ShieldCheck,
  Info,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { getErrorMessage } from "@/lib/errors";
import type { CursorPage, ESignatureEnvelope } from "@/lib/e-signatures";
import { signatureStatusLabel } from "@/lib/e-signatures";
import { useRouter } from "next/navigation";
import { rentDueLabel } from "@/lib/rent-policy";

type ActiveLease = {
  id: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  monthlyRent: number;
  securityDeposit: number;
  rentDueDay: number;
  gracePeriodDays: number;
  lateFeeAmount: number;
  unit: { unitNumber: string; property: { name: string } };
};

type LeaseDocument = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  extractionStatus?: string | null;
};

function isSafeDownloadUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

export default function TenantLease() {
  const router = useRouter();
  const [lease, setLease] = useState<ActiveLease | null>(null);
  const [leaseEnvelope, setLeaseEnvelope] = useState<ESignatureEnvelope | null>(
    null,
  );
  const [leaseDocuments, setLeaseDocuments] = useState<LeaseDocument[]>([]);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/tenant/portal/lease") as Promise<ActiveLease | null>,
      api.get("/tenant/e-signatures?documentType=LEASE&limit=1") as Promise<
        CursorPage<ESignatureEnvelope>
      >,
      api.get("/tenant/portal/documents") as Promise<LeaseDocument[]>,
    ])
      .then(([activeLease, signatures, documents]) => {
        setLease(activeLease);
        setLeaseEnvelope(signatures.items[0] ?? null);
        setLeaseDocuments(
          (documents ?? []).filter((document) => document.type === "LEASE"),
        );
      })
      .catch((error: unknown) =>
        toast.error(
          getErrorMessage(error, "Unable to load lease documentation"),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const openLeaseDocument = async (documentId: string) => {
    setOpeningDocumentId(documentId);
    try {
      const result = (await api.get(
        `/tenant/portal/documents/${documentId}/download-url`,
      )) as { url?: unknown };
      if (!isSafeDownloadUrl(result.url)) {
        throw new Error("Download unavailable");
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Unable to open lease document"));
    } finally {
      setOpeningDocumentId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center">
        <div className="h-24 w-24 bg-secondary rounded-full flex items-center justify-center mb-6">
          <FileText className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-semibold font-heading tracking-tight text-foreground">
          No Active Lease Found
        </h2>
        <p className="text-muted-foreground font-medium mt-3 max-w-md">
          Please contact Coach Johnson Realty management if you believe this is
          an error or if your lease is currently under review.
        </p>
      </div>
    );
  }

  const daysRemaining = differenceInDays(new Date(lease.endDate), new Date());
  const totalDays = differenceInDays(
    new Date(lease.endDate),
    new Date(lease.startDate),
  );
  const progress =
    totalDays > 0
      ? Math.max(
          0,
          Math.min(100, ((totalDays - daysRemaining) / totalDays) * 100),
        )
      : 0;

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Lease Agreement
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Review your current property contract terms and documentation.
          </p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-secondary border border-border rounded-2xl shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-premium/15">
            <ShieldCheck className="h-4 w-4 text-premium-text" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-heading leading-none">
              Status
            </p>
            <p className="text-sm font-bold text-foreground font-heading">
              Verified Resident
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-border bg-card shadow-sm rounded-[1.25rem] overflow-hidden">
            <CardHeader className="p-8 border-b border-border bg-secondary/30">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold font-heading tracking-tight text-foreground">
                    Active Lease - Unit {lease.unit.unitNumber}
                  </CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-2">
                    {lease.unit.property.name} / Lease ID: #
                    {lease.id.slice(-6).toUpperCase()}
                  </CardDescription>
                </div>
                <div className="rounded-md border border-premium/25 bg-premium/12 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-premium-text">
                  {leaseEnvelope
                    ? signatureStatusLabel(leaseEnvelope.status)
                    : "Not issued for signature"}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-heading">
                    Start Date
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {format(new Date(lease.startDate), "MMM dd, yyyy")}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-heading">
                    End Date
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {format(new Date(lease.endDate), "MMM dd, yyyy")}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-heading">
                    Monthly Rent
                  </p>
                  <p className="text-lg font-bold text-accent tabular-nums">
                    ${lease.monthlyRent.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-heading">
                    Deposit
                  </p>
                  <p className="text-lg font-bold text-foreground tabular-nums">
                    ${lease.securityDeposit.toLocaleString()}
                  </p>
                </div>
              </div>

              <Card className="border-border bg-card shadow-sm rounded-[1.25rem]">
                <CardHeader className="p-6 border-b border-border">
                  <CardTitle className="text-lg font-bold font-heading tracking-tight text-foreground">
                    Uploaded lease documents
                  </CardTitle>
                  <CardDescription>
                    Your uploaded lease records are available here for secure
                    viewing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  {leaseDocuments.length > 0 ? (
                    <div className="space-y-3">
                      {leaseDocuments.map((document) => (
                        <div
                          key={document.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <FileText className="h-5 w-5 shrink-0 text-primary" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">
                                {document.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Added {new Date(document.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={openingDocumentId === document.id}
                            onClick={() => void openLeaseDocument(document.id)}
                            className="w-full sm:w-auto rounded-xl"
                          >
                            {openingDocumentId === document.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" />
                            )}
                            Open lease
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No uploaded lease document is linked to this resident yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="p-8 border border-border rounded-[1.25rem] bg-secondary/30 flex flex-col md:flex-row items-center justify-between gap-6 group hover:border-primary/30 transition-[background-color,color,border-color,box-shadow,transform,opacity]">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
                    <FileText className="h-7 w-7 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground font-heading tracking-tight">
                      {leaseEnvelope?.title || "Lease signing package"}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-medium mt-1">
                      {leaseEnvelope?.archivedAt
                        ? `Securely archived ${format(new Date(leaseEnvelope.archivedAt), "MMM dd, yyyy")}`
                        : "The signed PDF appears here after Verdocs finalizes it."}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => router.push("/tenant/documents")}
                  className="w-full md:w-auto rounded-xl border-border hover:bg-primary hover:text-primary-foreground text-[10px] font-bold uppercase tracking-widest h-12 px-8 transition-[background-color,color,border-color,box-shadow,transform,opacity] font-heading"
                >
                  {leaseEnvelope?.status === "COMPLETED" ? (
                    <Download className="w-4 h-4 mr-2" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
                  {leaseEnvelope?.status === "COMPLETED"
                    ? "View signed files"
                    : "Review documents"}
                </Button>
              </div>

              <div className="p-6 bg-accent/5 rounded-2xl border border-accent/10 flex gap-4">
                <Info className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-foreground uppercase tracking-widest font-heading">
                    Lease Terms Notice
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
                    This is a legally binding document. Any modifications to the
                    lease must be requested in writing and approved by Coach
                    Johnson Realty management.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="border-none bg-primary text-primary-foreground  rounded-[1.25rem] overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 group-hover:-rotate-12 transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-700">
              <Calendar className="h-48 w-48 -mr-16 -mt-16" />
            </div>
            <CardHeader className="border-b border-white/10 pb-6 relative z-10">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/70 font-heading">
                Time Remaining
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-10 pb-10 text-center relative z-10">
              <div className="text-7xl font-bold font-heading mb-2 tabular-nums">
                {daysRemaining > 0 ? daysRemaining : 0}
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary-foreground/75 font-heading">
                Days Left in Term
              </p>

              <div className="mt-12 w-full h-2 bg-secondary/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-foreground"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-4 flex justify-between text-[10px] font-bold uppercase tracking-widest text-primary-foreground/60 font-heading">
                <span>{format(new Date(lease.startDate), "MMM yyyy")}</span>
                <span>{format(new Date(lease.endDate), "MMM yyyy")}</span>
              </div>

              <Button
                nativeButton={false}
                render={<Link href="/tenant/messages" />}
                className="mt-10 w-full border border-white/10 bg-secondary/20 py-8 text-primary-foreground hover:bg-secondary/40"
              >
                Message management about this lease
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm rounded-[1.25rem] overflow-hidden">
            <CardHeader className="bg-secondary/30 border-b border-border">
              <CardTitle className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground font-heading">
                Lease Policy Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-heading">
                    Late Fee
                  </span>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    ${lease.lateFeeAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-heading">
                    Rent Due
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {rentDueLabel(lease.rentDueDay)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-heading">
                    Grace Period
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {lease.gracePeriodDays} day
                    {lease.gracePeriodDays === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
