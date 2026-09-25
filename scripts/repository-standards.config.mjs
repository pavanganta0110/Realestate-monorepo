export const repositoryStandards = {
  maxSourceLines: 500,
  oversizedFileAllowances: {
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
