export const repositoryStandards = {
  maxSourceLines: 500,
  oversizedFileAllowances: {
    "backend/src/documents/lease-document-extraction.service.ts": {
      maxLines: 560,
      reason:
        "Cohesive lease-document workflow covering secure retrieval, Gemini extraction, term normalization, review application, occupancy updates, and audit history.",
    },
    "backend/src/stripe/stripe-client.service.ts": {
      maxLines: 560,
      reason:
        "Cohesive Stripe boundary covering Connect onboarding, payouts, payment intents, checkout, webhook helpers, and platform configuration handling.",
    },
    "frontend/src/app/admin/announcements/page.tsx": {
      maxLines: 620,
      reason:
        "Cohesive admin announcement workspace covering audience selection, property and unit targeting, acknowledgement state, creation, editing, and publishing.",
    },
    "frontend/src/app/admin/leases/page.tsx": {
      maxLines: 600,
      reason:
        "Cohesive admin lease workspace covering lease creation, document upload entry point, resident selection, rent policy updates, search, status changes, and lifecycle navigation.",
    },
    "frontend/src/components/portal/tenant-document-manager.tsx": {
      maxLines: 620,
      reason:
        "Cohesive private-document workflow shared by resident and admin portals, including secure upload, document access, removal, lease extraction review, and term application.",
    },
    "frontend/src/app/admin/owners/page.tsx": {
      maxLines: 520,
      reason:
        "Cohesive owner workspace covering owner creation, editing, payout onboarding, commission management, and guarded deletion.",
    },
    "backend/src/e-signatures/e-signatures.service.ts": {
      maxLines: 1200,
      reason:
        "Cohesive Verdocs envelope orchestration with provider state transitions, archival, webhook handling, and audit guarantees.",
    },
    "backend/src/emails/emails.service.ts": {
      maxLines: 925,
      reason:
        "Cohesive transactional email boundary covering persistence, Resend delivery, tenant metadata, scoped retries, templates, and signed webhook state.",
    },
    "backend/src/listings/sale-listings.service.ts": {
      maxLines: 750,
      reason:
        "Cohesive sale-listing aggregate enforcing draft, review, publication, storage, notification, and audit transitions atomically.",
    },
    "backend/src/commissions/sale-commissions.service.ts": {
      maxLines: 700,
      reason:
        "Cohesive append-only manual commission ledger with correction, voiding, attribution, pagination, reporting, and audit rules.",
    },
    "backend/src/payments/payments.service.ts": {
      maxLines: 1100,
      reason:
        "Cohesive rent-payment aggregate with idempotent ledger updates, Stripe checkout settlement, connected-owner proceeds, webhook replay protection, and audit behavior.",
    },
    "backend/src/properties/properties.service.ts": {
      maxLines: 550,
      reason:
        "Cohesive rental-property aggregate with publishing, media storage, owner attribution, validation, and audit transitions.",
    },
  },
};
