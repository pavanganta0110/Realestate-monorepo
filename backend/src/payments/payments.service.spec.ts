import {
  PaymentStatus,
  PaymentPurpose,
  Prisma,
  StripeCheckoutStatus,
} from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService owner attribution', () => {
  type PaymentMutationData = {
    propertyOwnerId: string | null;
    ownerCommissionRate: Prisma.Decimal;
    managementCommissionAmount: Prisma.Decimal;
    ownerProceedsAmount: Prisma.Decimal;
    paidAt: Date | null;
  };
  const input = {
    clientRequestId: '12345678-1234-4234-8234-123456789012',
    tenantId: 'tenant-1',
    leaseId: 'lease-1',
    unitId: 'unit-1',
    rentAmount: 2000,
    totalAmount: 2000,
    paidAmount: 2000,
    dueDate: new Date('2026-08-01'),
    status: PaymentStatus.PAID,
  };

  it('does not let staff alter money on a Stripe-confirmed payment', async () => {
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'payment-1',
          purpose: PaymentPurpose.RENT,
          status: PaymentStatus.PAID,
          paidAmount: 1800,
          lateFee: 0,
          lastStatusRequestId: null,
          stripeCheckoutStatus: StripeCheckoutStatus.COMPLETE,
        }),
      },
    };
    const emails = { sendPaymentRecorded: jest.fn() };

    await expect(
      new PaymentsService(prisma as never, emails as never).updatePaymentStatus(
        'payment-1',
        {
          clientRequestId: '92345678-1234-4234-8234-123456789012',
          status: PaymentStatus.PAID,
          lateFee: 50,
          adjustmentReason: 'Late fee entered in error',
        },
        'admin-1',
      ),
    ).rejects.toThrow('Stripe-confirmed payment cannot be changed manually');
  });

  it('snapshots the owner and exact management split atomically on receipt', async () => {
    const created = {
      id: 'payment-1',
      purpose: PaymentPurpose.RENT,
      ...input,
      paidAt: new Date('2026-08-22'),
      updatedAt: new Date('2026-08-22'),
      balanceDue: 0,
      tenant: {
        firstName: 'Terry',
        lastName: 'Tenant',
        email: 'tenant@example.com',
      },
    };
    const tx = {
      lease: { findFirst: jest.fn().mockResolvedValue({ id: 'lease-1' }) },
      unit: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'unit-1',
          property: {
            owner: {
              id: 'owner-1',
              commissionRate: new Prisma.Decimal('12.50'),
            },
          },
        }),
      },
      payment: { create: jest.fn().mockResolvedValue(created) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const emails = { sendPaymentRecorded: jest.fn().mockResolvedValue({}) };

    await new PaymentsService(prisma as never, emails as never).recordPayment(
      input,
      'admin-1',
    );

    const data = (
      tx.payment.create.mock.calls as unknown as Array<
        [{ data: PaymentMutationData }]
      >
    )[0][0].data;
    expect(data.propertyOwnerId).toBe('owner-1');
    expect(data.ownerCommissionRate.toFixed(2)).toBe('12.50');
    expect(data.managementCommissionAmount.toFixed(2)).toBe('250.00');
    expect(data.ownerProceedsAmount.toFixed(2)).toBe('1750.00');
    expect(data.paidAt).toBeInstanceOf(Date);
    const auditData = (
      tx.auditLog.create.mock.calls as unknown as Array<
        [{ data: { action: string; resourceId: string } }]
      >
    )[0][0].data;
    expect(auditData.action).toBe('PAYMENT_RECORDED');
    expect(auditData.resourceId).toBe('payment-1');
  });

  it('keeps the historical owner and rate when a received payment is corrected', async () => {
    const paidAt = new Date('2026-08-10');
    const payment = {
      id: 'payment-1',
      purpose: PaymentPurpose.RENT,
      tenantId: 'tenant-1',
      leaseId: 'lease-1',
      unitId: 'unit-1',
      totalAmount: 2000,
      paidAmount: 1800,
      balanceDue: 200,
      status: PaymentStatus.PARTIAL,
      paidAt,
      propertyOwnerId: 'owner-original',
      ownerCommissionRate: new Prisma.Decimal('10.00'),
      updatedAt: new Date('2026-08-20'),
      lastStatusRequestId: null,
      tenant: {
        firstName: 'Terry',
        lastName: 'Tenant',
        email: 'tenant@example.com',
      },
      unit: {
        property: {
          owner: {
            id: 'owner-new',
            commissionRate: new Prisma.Decimal('20.00'),
          },
        },
      },
    };
    const updated = {
      ...payment,
      paidAmount: 2000,
      status: PaymentStatus.PAID,
      updatedAt: new Date('2026-08-22'),
    };
    const tx = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(payment) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const emails = { sendPaymentRecorded: jest.fn().mockResolvedValue({}) };

    await new PaymentsService(
      prisma as never,
      emails as never,
    ).updatePaymentStatus(
      'payment-1',
      {
        clientRequestId: '22345678-1234-4234-8234-123456789012',
        status: PaymentStatus.PAID,
        paidAmount: 2000,
      },
      'admin-1',
    );

    const data = (
      tx.payment.updateMany.mock.calls as unknown as Array<
        [{ data: PaymentMutationData }]
      >
    )[0][0].data;
    expect(data.propertyOwnerId).toBe('owner-original');
    expect(data.ownerCommissionRate.toFixed(2)).toBe('10.00');
    expect(data.managementCommissionAmount.toFixed(2)).toBe('200.00');
    expect(data.ownerProceedsAmount.toFixed(2)).toBe('1800.00');
    expect(data.paidAt).toBe(paidAt);
  });

  it('creates a tenant-initiated one-time Checkout with the owner commission', async () => {
    const payment = {
      id: 'payment-1',
      purpose: PaymentPurpose.RENT,
      status: PaymentStatus.PENDING,
      balanceDue: 1200,
      paidAmount: 0,
      ownerCommissionRate: null,
      updatedAt: new Date('2026-08-23T12:00:00.000Z'),
      stripeCheckoutStatus: 'NOT_STARTED',
      stripeCheckoutUrl: null,
      stripeCheckoutExpiresAt: null,
      tenant: { email: 'tenant@example.com' },
      unit: {
        property: {
          name: 'Oakwood Place',
          owner: {
            id: 'owner-1',
            commissionRate: new Prisma.Decimal('12.50'),
            stripeConnectedAccountId: 'acct_owner_1',
            payoutStatus: 'ACTIVE',
          },
        },
      },
    };
    const checkout = {
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      expires_at: 1_788_000_000,
    };
    const tx = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...payment,
          stripeCheckoutExpiresAt: new Date(checkout.expires_at * 1000),
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      payment: { findFirst: jest.fn().mockResolvedValue(payment) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const stripe = {
      retrieveConnectedAccount: jest.fn().mockResolvedValue({
        id: 'acct_owner_1',
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { status: 'active' } },
            },
          },
        },
      }),
      recipientTransferStatus: jest.fn().mockReturnValue('active'),
      ownerPaymentsStatus: jest.fn().mockReturnValue('active'),
      createCheckoutSession: jest.fn().mockResolvedValue(checkout),
    };
    const emails = { sendPaymentRecorded: jest.fn().mockResolvedValue({}) };

    const result = await new PaymentsService(
      prisma as never,
      emails as never,
      stripe as never,
    ).startTenantCheckout('user-1', 'payment-1');

    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'payment-1',
        amountCents: 120000,
        commissionCents: 15000,
        connectedAccountId: 'acct_owner_1',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ url: checkout.url, reused: false }),
    );
    const updateData = (
      tx.payment.updateMany.mock.calls as unknown as Array<
        [
          {
            data: {
              stripeCheckoutStatus: string;
              ownerCommissionRate: Prisma.Decimal;
            };
          },
        ]
      >
    )[0][0].data;
    expect(updateData.stripeCheckoutStatus).toBe('OPEN');
    expect(updateData.ownerCommissionRate.toFixed(2)).toBe('12.50');
  });

  it('requests a destination-charge refund without changing the ledger before Stripe confirms it', async () => {
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'payment-1',
          purpose: PaymentPurpose.RENT,
          paidAmount: 1200,
          refundedAmount: 200,
          stripeCheckoutStatus: StripeCheckoutStatus.COMPLETE,
          stripePaymentIntentId: 'pi_rent_1',
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const stripePaymentLedger = {
      requestStripeRefund: jest.fn().mockResolvedValue({
        refundId: 're_refund_1',
        amount: 300,
        status: 'submitted',
      }),
    };

    const result = await new PaymentsService(
      prisma as never,
      {} as never,
      undefined,
      stripePaymentLedger as never,
    ).requestStripeRefund(
      'payment-1',
      {
        clientRequestId: '32345678-1234-4234-8234-123456789012',
        amount: 300,
        adjustmentReason: 'Duplicate payment correction',
      },
      'admin-1',
    );

    expect(stripePaymentLedger.requestStripeRefund).toHaveBeenCalledWith(
      'payment-1',
      {
        clientRequestId: '32345678-1234-4234-8234-123456789012',
        amount: 300,
        adjustmentReason: 'Duplicate payment correction',
      },
      'admin-1',
    );
    expect(result).toEqual({
      refundId: 're_refund_1',
      amount: 300,
      status: 'submitted',
    });
  });

  it('routes an Accounts v2 Thin event through the owner payout synchronizer', async () => {
    const prisma = {
      stripeWebhookEvent: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const stripe = {
      retrieveConnectedAccount: jest.fn().mockResolvedValue({
        id: 'acct_owner_1',
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { status: 'active' } },
            },
          },
        },
      }),
    };
    const stripePaymentLedger = {
      processOwnerAccount: jest.fn().mockResolvedValue({ ownerId: 'owner-1' }),
    };

    const result = await new PaymentsService(
      prisma as never,
      {} as never,
      stripe as never,
      stripePaymentLedger as never,
    ).processStripeConnectWebhook({
      id: 'evt_connect_1',
      type: 'v2.core.account[configuration.recipient].capability_status_updated',
      livemode: true,
      related_object: { id: 'acct_owner_1', type: 'v2.core.account' },
    });

    expect(result).toEqual({ received: true, duplicate: false });
    expect(stripe.retrieveConnectedAccount).toHaveBeenCalledWith(
      'acct_owner_1',
    );
    const eventUpdate = (
      prisma.stripeWebhookEvent.update.mock.calls as unknown as Array<
        [{ data: { status: string } }]
      >
    )[0][0];
    expect(stripePaymentLedger.processOwnerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acct_owner_1' }),
    );
    expect(eventUpdate.data.status).toBe('PROCESSED');
  });
});
