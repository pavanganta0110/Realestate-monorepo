import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  PropertyOwnerPayoutStatus,
  StripeCheckoutStatus,
} from '@prisma/client';
import { EmailsService } from '../emails/emails.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeClient } from '../stripe/stripe-client.service';

@Injectable()
export class StripePaymentLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeClient,
    private readonly emails: EmailsService,
  ) {}

  private cents(amount: number) {
    return Math.round((amount + Number.EPSILON) * 100);
  }

  private fromCents(amount: number) {
    return amount / 100;
  }

  private value(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }

  private numberValue(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private metadata(record: Record<string, unknown>) {
    const metadata = record.metadata;
    return metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : {};
  }

  private splitPaidAmount(paidAmount: number, rate: Prisma.Decimal | null) {
    if (!rate) return {};
    const gross = new Prisma.Decimal(paidAmount.toFixed(2));
    const managementCommissionAmount = gross
      .mul(rate)
      .div(100)
      .toDecimalPlaces(2);
    return {
      ownerCommissionRate: rate,
      managementCommissionAmount,
      ownerProceedsAmount: gross
        .minus(managementCommissionAmount)
        .toDecimalPlaces(2),
    };
  }

  private async paymentIdForCharge(record: Record<string, unknown>) {
    const metadataPaymentId = this.value(this.metadata(record), 'payment_id');
    if (metadataPaymentId) return metadataPaymentId;
    const paymentIntentId = this.value(record, 'payment_intent');
    if (paymentIntentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        select: { id: true },
      });
      if (payment) return payment.id;
      const intent = await this.stripe.retrievePaymentIntent(paymentIntentId);
      if (intent.metadata?.payment_id) return intent.metadata.payment_id;
    }
    const chargeId = this.value(record, 'charge') ?? this.value(record, 'id');
    if (!chargeId) return undefined;
    const payment = await this.prisma.payment.findUnique({
      where: { stripeChargeId: chargeId },
      select: { id: true },
    });
    return payment?.id;
  }

  async processCharge(record: Record<string, unknown>, type: string) {
    const paymentId = await this.paymentIdForCharge(record);
    if (!paymentId) return undefined;
    const recordId = this.value(record, 'id');
    const chargeId =
      type === 'charge.dispute.created'
        ? this.value(record, 'charge')
        : recordId;
    const transferId = this.value(record, 'transfer');
    const paymentIntentId = this.value(record, 'payment_intent');
    if (type === 'charge.succeeded') {
      await this.prisma.payment.updateMany({
        where: { id: paymentId },
        data: {
          stripeChargeId: chargeId,
          stripeTransferId: transferId,
          ...(paymentIntentId
            ? { stripePaymentIntentId: paymentIntentId }
            : {}),
          stripeLastEventAt: new Date(),
        },
      });
      return { paymentId, action: 'charge_recorded' };
    }
    if (type === 'charge.refunded') {
      const refundedCents = this.numberValue(record, 'amount_refunded');
      if (refundedCents === undefined) return undefined;
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          totalAmount: true,
          paidAmount: true,
          refundedAmount: true,
          ownerCommissionRate: true,
        },
      });
      if (!payment) return undefined;
      const refundedAmount = this.fromCents(refundedCents);
      if (refundedAmount > payment.paidAmount + 0.005) {
        throw new BadRequestException('Stripe refund exceeds recorded payment');
      }
      if (refundedAmount <= payment.refundedAmount + 0.005) {
        return { paymentId, action: 'refund_already_recorded' };
      }
      const netPaid = Math.max(0, payment.paidAmount - refundedAmount);
      const split = payment.ownerCommissionRate
        ? this.splitPaidAmount(netPaid, payment.ownerCommissionRate)
        : {};
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            refundedAmount,
            balanceDue: Math.max(0, payment.totalAmount - netPaid),
            status:
              netPaid <= 0.005 ? PaymentStatus.PENDING : PaymentStatus.PARTIAL,
            ...split,
            stripeLastEventAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'STRIPE_RENT_PAYMENT_REFUND_RECORDED',
            resource: 'payment',
            resourceId: paymentId,
            newValue: JSON.stringify({
              chargeId,
              cumulativeRefunded: refundedAmount.toFixed(2),
              refundDelta: (refundedAmount - payment.refundedAmount).toFixed(2),
            }),
          },
        });
      });
      return { paymentId, action: 'refund_recorded' };
    }
    if (type === 'charge.dispute.created') {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          paidAmount: true,
          ownerCommissionRate: true,
          ownerProceedsAmount: true,
          stripePaymentIntentId: true,
          stripeTransferId: true,
          stripeTransferReversalId: true,
        },
      });
      if (!payment) return undefined;
      const disputeId = recordId;
      if (!disputeId) {
        throw new BadRequestException('Stripe dispute ID is missing');
      }
      if (payment.stripeTransferReversalId) {
        return { paymentId, action: 'dispute_recorded' };
      }
      let destinationTransferId: string | undefined =
        transferId ?? payment.stripeTransferId ?? undefined;
      if (!destinationTransferId && payment.stripePaymentIntentId) {
        const intent = await this.stripe.retrievePaymentIntent(
          payment.stripePaymentIntentId,
        );
        const latestCharge = intent.latest_charge;
        const latestTransfer =
          latestCharge && typeof latestCharge === 'object'
            ? latestCharge.transfer
            : undefined;
        destinationTransferId =
          typeof latestTransfer === 'string'
            ? latestTransfer
            : latestTransfer && typeof latestTransfer.id === 'string'
              ? latestTransfer.id
              : undefined;
      }
      if (!destinationTransferId) {
        // Direct charges are created on the owner account, so there is no
        // platform transfer to reverse when Stripe manages the dispute loss.
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: paymentId },
            data: { stripeLastEventAt: new Date() },
          });
          await tx.auditLog.create({
            data: {
              action: 'STRIPE_RENT_PAYMENT_DIRECT_CHARGE_DISPUTE_RECORDED',
              resource: 'payment',
              resourceId: paymentId,
              newValue: JSON.stringify({ chargeId, disputeId }),
            },
          });
        });
        return { paymentId, action: 'direct_charge_dispute_recorded' };
      }
      const dispute = await this.stripe.retrieveDispute(disputeId);
      if (!Number.isFinite(dispute.amount) || dispute.amount <= 0) {
        throw new BadRequestException('Stripe dispute amount is invalid');
      }
      const commissionRate = Number(
        payment.ownerCommissionRate?.toString() ?? '0',
      );
      const proportionalOwnerCents = Math.round(
        dispute.amount * Math.max(0, 1 - commissionRate / 100),
      );
      const recordedOwnerCents = this.cents(
        Number(payment.ownerProceedsAmount?.toString() ?? payment.paidAmount),
      );
      const reversalAmountCents = Math.min(
        proportionalOwnerCents,
        recordedOwnerCents,
      );
      if (reversalAmountCents <= 0) {
        throw new BadRequestException(
          'Stripe dispute has no owner proceeds to reverse',
        );
      }
      const reversal = await this.stripe.createTransferReversal({
        transferId: destinationTransferId,
        amountCents: reversalAmountCents,
        idempotencyKey: `rent-dispute-reversal-${dispute.id}`,
      });
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.payment.updateMany({
          where: { id: paymentId, stripeTransferReversalId: null },
          data: {
            stripeTransferId: destinationTransferId,
            stripeTransferReversalId: reversal.id,
            stripeLastEventAt: new Date(),
          },
        });
        if (changed.count === 1) {
          await tx.auditLog.create({
            data: {
              action: 'STRIPE_RENT_PAYMENT_DISPUTE_TRANSFER_REVERSED',
              resource: 'payment',
              resourceId: paymentId,
              newValue: JSON.stringify({
                chargeId,
                disputeId,
                transferId: destinationTransferId,
                transferReversalId: reversal.id,
                disputedAmountCents: dispute.amount,
                reversalAmountCents,
              }),
            },
          });
        }
      });
      return { paymentId, action: 'dispute_recorded' };
    }
    return undefined;
  }

  async requestStripeRefund(
    paymentId: string,
    data: { clientRequestId: string; amount: number; adjustmentReason: string },
    userId: string,
  ) {
    const adjustmentReason = data.adjustmentReason.trim();
    if (!adjustmentReason) {
      throw new BadRequestException('A refund reason is required');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        purpose: true,
        paidAmount: true,
        refundedAmount: true,
        stripeCheckoutStatus: true,
        stripePaymentIntentId: true,
        propertyOwner: { select: { stripeConnectedAccountId: true } },
      },
    });
    if (
      !payment ||
      payment.purpose !== PaymentPurpose.RENT ||
      payment.stripeCheckoutStatus !== StripeCheckoutStatus.COMPLETE ||
      !payment.stripePaymentIntentId
    ) {
      throw new BadRequestException(
        'Only a Stripe-confirmed rent payment can be refunded here',
      );
    }
    const refundableCents = this.cents(
      Math.max(0, payment.paidAmount - payment.refundedAmount),
    );
    const amountCents = this.cents(data.amount);
    if (amountCents > refundableCents) {
      throw new BadRequestException(
        'Refund amount exceeds the refundable balance',
      );
    }
    const refund = await this.stripe.createDestinationChargeRefund({
      paymentIntentId: payment.stripePaymentIntentId,
      amountCents,
      connectedAccountId:
        payment.propertyOwner?.stripeConnectedAccountId ?? undefined,
      idempotencyKey: `rent-refund-${payment.id}-${data.clientRequestId}`,
    });
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'STRIPE_RENT_PAYMENT_REFUND_REQUESTED',
        resource: 'payment',
        resourceId: payment.id,
        newValue: JSON.stringify({
          stripeRefundId: refund.id,
          amount: this.fromCents(amountCents),
          adjustmentReason,
          reverseTransfer: true,
          refundApplicationFee: true,
        }),
      },
    });
    return {
      refundId: refund.id,
      amount: this.fromCents(amountCents),
      status: 'submitted',
    };
  }

  async processOwnerAccount(record: Record<string, unknown>) {
    const accountId = this.value(record, 'id');
    if (!accountId) return undefined;
    const capabilityStatus = this.stripe.ownerPaymentsStatus(record);
    const payoutStatus =
      capabilityStatus === 'active'
        ? PropertyOwnerPayoutStatus.ACTIVE
        : capabilityStatus === 'inactive' || !capabilityStatus
          ? PropertyOwnerPayoutStatus.PENDING_ONBOARDING
          : PropertyOwnerPayoutStatus.RESTRICTED;
    const owner = await this.prisma.propertyOwner.findUnique({
      where: { stripeConnectedAccountId: accountId },
    });
    if (!owner) return undefined;
    const becameActive =
      owner.payoutStatus !== PropertyOwnerPayoutStatus.ACTIVE &&
      payoutStatus === PropertyOwnerPayoutStatus.ACTIVE;
    await this.prisma.$transaction(async (tx) => {
      await tx.propertyOwner.update({
        where: { id: owner.id },
        data: {
          payoutStatus,
          stripeAccountLastSyncedAt: new Date(),
          onboardedAt: becameActive ? new Date() : owner.onboardedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'PROPERTY_OWNER_STRIPE_CAPABILITY_UPDATED',
          resource: 'property_owner',
          resourceId: owner.id,
          newValue: JSON.stringify({ capabilityStatus, payoutStatus }),
        },
      });
    });
    if (becameActive) {
      await this.emails.sendOwnerStripeOnboardingCompleted(
        owner.contactEmail,
        { name: owner.ownerName ?? owner.companyName ?? 'Property owner' },
        owner.id,
      );
    }
    return { ownerId: owner.id };
  }
}
