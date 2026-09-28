import { PaymentPurpose, Prisma, StripeCheckoutStatus } from '@prisma/client';
import { StripePaymentLedgerService } from './stripe-payment-ledger.service';

describe('StripePaymentLedgerService', () => {
  it('requests a destination-charge refund and waits for the signed webhook to change the ledger', async () => {
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
        update: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const stripe = {
      createDestinationChargeRefund: jest
        .fn()
        .mockResolvedValue({ id: 're_refund_1' }),
    };
    const service = new StripePaymentLedgerService(
      prisma as never,
      stripe as never,
      {} as never,
    );

    const result = await service.requestStripeRefund(
      'payment-1',
      {
        clientRequestId: '32345678-1234-4234-8234-123456789012',
        amount: 300,
        adjustmentReason: 'Duplicate payment correction',
      },
      'admin-1',
    );

    expect(stripe.createDestinationChargeRefund).toHaveBeenCalledWith({
      paymentIntentId: 'pi_rent_1',
      amountCents: 30000,
      connectedAccountId: undefined,
      idempotencyKey:
        'rent-refund-payment-1-32345678-1234-4234-8234-123456789012',
    });
    expect(prisma.payment.update).not.toHaveBeenCalled();
    const auditData = (
      prisma.auditLog.create.mock.calls as unknown as Array<
        [{ data: { action: string } }]
      >
    )[0][0].data;
    expect(auditData.action).toBe('STRIPE_RENT_PAYMENT_REFUND_REQUESTED');
    expect(result).toEqual({
      refundId: 're_refund_1',
      amount: 300,
      status: 'submitted',
    });
  });

  it('recalculates net rent and owner proceeds from Stripe cumulative refunds', async () => {
    const tx = {
      payment: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      payment: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'payment-1' })
          .mockResolvedValueOnce({
            id: 'payment-1',
            totalAmount: 1200,
            paidAmount: 1200,
            refundedAmount: 0,
            ownerCommissionRate: new Prisma.Decimal('10'),
          }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new StripePaymentLedgerService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await service.processCharge(
      {
        id: 'ch_rent_1',
        payment_intent: 'pi_rent_1',
        amount_refunded: 20000,
      },
      'charge.refunded',
    );

    const updateData = (
      tx.payment.update.mock.calls as unknown as Array<
        [
          {
            data: {
              refundedAmount: number;
              balanceDue: number;
              managementCommissionAmount: Prisma.Decimal;
              ownerProceedsAmount: Prisma.Decimal;
            };
          },
        ]
      >
    )[0][0].data;
    expect(updateData.refundedAmount).toBe(200);
    expect(updateData.balanceDue).toBe(200);
    expect(updateData.managementCommissionAmount.toFixed(2)).toBe('100.00');
    expect(updateData.ownerProceedsAmount.toFixed(2)).toBe('900.00');
  });

  it('handles the Stripe dispute object shape and reverses only owner proceeds', async () => {
    const tx = {
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      payment: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'payment-1' })
          .mockResolvedValueOnce({
            id: 'payment-1',
            paidAmount: 1200,
            ownerCommissionRate: new Prisma.Decimal('10'),
            ownerProceedsAmount: new Prisma.Decimal('1080'),
            stripePaymentIntentId: 'pi_rent_1',
            stripeTransferId: 'tr_owner_1',
            stripeTransferReversalId: null,
          }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const stripe = {
      retrieveDispute: jest
        .fn()
        .mockResolvedValue({ id: 'dp_rent_1', amount: 120000 }),
      createTransferReversal: jest
        .fn()
        .mockResolvedValue({ id: 'trr_owner_1' }),
    };
    const service = new StripePaymentLedgerService(
      prisma as never,
      stripe as never,
      {} as never,
    );

    await service.processCharge(
      {
        id: 'dp_rent_1',
        charge: 'ch_rent_1',
        payment_intent: 'pi_rent_1',
        amount: 120000,
      },
      'charge.dispute.created',
    );

    expect(stripe.retrieveDispute).toHaveBeenCalledWith('dp_rent_1');
    expect(stripe.createTransferReversal).toHaveBeenCalledWith({
      transferId: 'tr_owner_1',
      amountCents: 108000,
      idempotencyKey: 'rent-dispute-reversal-dp_rent_1',
    });
    const updateData = (
      tx.payment.updateMany.mock.calls as unknown as Array<
        [{ data: { stripeTransferReversalId: string } }]
      >
    )[0][0].data;
    expect(updateData.stripeTransferReversalId).toBe('trr_owner_1');
    const auditData = (
      tx.auditLog.create.mock.calls as unknown as Array<
        [{ data: { action: string; newValue: string } }]
      >
    )[0][0].data;
    expect(auditData.action).toBe(
      'STRIPE_RENT_PAYMENT_DISPUTE_TRANSFER_REVERSED',
    );
    expect(JSON.parse(auditData.newValue)).toEqual(
      expect.objectContaining({
        chargeId: 'ch_rent_1',
        disputeId: 'dp_rent_1',
        disputedAmountCents: 120000,
        reversalAmountCents: 108000,
      }),
    );
  });
});
