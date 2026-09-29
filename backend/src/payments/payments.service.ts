import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import {
  PaymentStatus,
  PaymentPurpose,
  Prisma,
  PropertyOwnerPayoutStatus,
  StripeCheckoutStatus,
  StripeWebhookEventStatus,
} from '@prisma/client';
import {
  StripeClient,
  StripeEvent,
  StripeThinEvent,
} from '../stripe/stripe-client.service';
import { StripePaymentLedgerService } from './stripe-payment-ledger.service';
import {
  isSamePaymentRecordRequest,
  paymentRecordFingerprint,
  resolvedPaymentStatus,
  type PaymentRecordInput,
} from './payment-record.utils';

const paymentWithTenantInclude = {
  tenant: true,
} satisfies Prisma.PaymentInclude;
const paymentWithContextInclude = {
  tenant: true,
  unit: {
    select: {
      property: {
        select: {
          owner: { select: { id: true, commissionRate: true } },
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentWithTenant = Prisma.PaymentGetPayload<{
  include: typeof paymentWithTenantInclude;
}>;
type PaymentWithContext = Prisma.PaymentGetPayload<{
  include: typeof paymentWithContextInclude;
}>;

const paymentWithStripeContextInclude = {
  tenant: true,
  unit: {
    select: {
      property: {
        select: {
          name: true,
          owner: {
            select: {
              id: true,
              ownerName: true,
              companyName: true,
              contactEmail: true,
              commissionRate: true,
              stripeConnectedAccountId: true,
              payoutStatus: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private emails: EmailsService,
    private readonly stripe?: StripeClient,
    private readonly stripePaymentLedger?: StripePaymentLedgerService,
  ) {}

  private cents(amount: number) {
    return Math.round((amount + Number.EPSILON) * 100);
  }

  private fromCents(amount: number) {
    return amount / 100;
  }

  private splitPaidAmount(paidAmount: number, rate: Prisma.Decimal | null) {
    if (!rate) {
      return {
        ownerCommissionRate: null,
        managementCommissionAmount: null,
        ownerProceedsAmount: null,
      };
    }
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

  private tenantName(tenant: { firstName: string; lastName: string }) {
    return `${tenant.firstName} ${tenant.lastName}`;
  }

  private async syncOwnerPayoutReadiness(
    owner: { id: string; payoutStatus: PropertyOwnerPayoutStatus },
    capabilityStatus: string | undefined,
  ) {
    const payoutStatus =
      capabilityStatus === 'active'
        ? PropertyOwnerPayoutStatus.ACTIVE
        : capabilityStatus === 'inactive' || !capabilityStatus
          ? PropertyOwnerPayoutStatus.PENDING_ONBOARDING
          : PropertyOwnerPayoutStatus.RESTRICTED;
    if (owner.payoutStatus === payoutStatus) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.propertyOwner.update({
        where: { id: owner.id },
        data: { payoutStatus, stripeAccountLastSyncedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: 'PROPERTY_OWNER_STRIPE_CAPABILITY_RECHECKED',
          resource: 'property_owner',
          resourceId: owner.id,
          newValue: JSON.stringify({ payoutStatus }),
        },
      });
    });
  }

  private dueDate(value: Date) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(value);
  }

  async findAll() {
    return this.prisma.payment.findMany({
      where: { purpose: PaymentPurpose.RENT },
      include: { tenant: true, lease: true, unit: true, propertyOwner: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });
  }

  async findByTenant(tenantId: string) {
    return this.prisma.payment.findMany({
      where: {
        tenantId,
        OR: [
          { purpose: PaymentPurpose.RENT },
          {
            purpose: PaymentPurpose.MOVE_IN,
            OR: [
              { paidAmount: { gt: 0 } },
              { stripeCheckoutStatus: StripeCheckoutStatus.OPEN },
            ],
          },
        ],
      },
      include: {
        lease: true,
        unit: true,
        allocations: { include: { moveInCharge: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 120,
    });
  }

  async findByUser(userId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { userId } });
    if (!tenant) return [];
    return this.findByTenant(tenant.id);
  }

  async findOneForUser(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenant: { userId } },
      include: {
        tenant: true,
        lease: true,
        unit: { include: { property: true } },
        allocations: { include: { moveInCharge: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async recordPayment(
    data: PaymentRecordInput & { clientRequestId: string },
    userId?: string,
  ) {
    const expectedTotal = data.rentAmount + (data.lateFee ?? 0);
    if (Math.abs(data.totalAmount - expectedTotal) > 0.005) {
      throw new BadRequestException(
        'Total amount must equal rent plus late fee',
      );
    }
    const requestFingerprint = paymentRecordFingerprint(data);
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: data.clientRequestId },
      include: paymentWithTenantInclude,
    });
    if (existing) {
      if (
        existing.recordRequestFingerprint
          ? existing.recordRequestFingerprint !== requestFingerprint
          : !isSamePaymentRecordRequest(existing, data)
      ) {
        throw new ConflictException(
          'This payment request ID was already used with different details',
        );
      }
      return existing;
    }

    const status = resolvedPaymentStatus(data);
    const paidAmount = data.paidAmount ?? 0;
    if (paidAmount > data.totalAmount) {
      throw new BadRequestException('Paid amount cannot exceed the total due');
    }
    if (status === PaymentStatus.WAIVED && paidAmount > 0) {
      throw new BadRequestException(
        'A payment with money received cannot be waived; record it as paid or partial instead',
      );
    }
    const balanceDue =
      status === PaymentStatus.WAIVED
        ? 0
        : Math.max(0, data.totalAmount - paidAmount);
    const { clientRequestId, ...paymentData } = data;

    let result: { payment: PaymentWithTenant; created: boolean };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const [lease, unit] = await Promise.all([
            tx.lease.findFirst({
              where: {
                id: data.leaseId,
                tenantId: data.tenantId,
                unitId: data.unitId,
              },
              select: { id: true },
            }),
            tx.unit.findUnique({
              where: { id: data.unitId },
              select: {
                id: true,
                property: {
                  select: {
                    owner: { select: { id: true, commissionRate: true } },
                  },
                },
              },
            }),
          ]);
          if (!lease || !unit) {
            throw new BadRequestException(
              'The tenant, lease, and unit must belong to the same tenancy',
            );
          }
          const isReceived = paidAmount > 0 && status !== PaymentStatus.WAIVED;
          const owner = isReceived ? unit.property.owner : null;
          const split = this.splitPaidAmount(
            isReceived ? paidAmount : 0,
            owner?.commissionRate ?? null,
          );
          const created = await tx.payment.create({
            data: {
              ...paymentData,
              purpose: PaymentPurpose.RENT,
              idempotencyKey: clientRequestId,
              recordRequestFingerprint: requestFingerprint,
              paidAmount,
              balanceDue,
              status,
              paidAt: isReceived ? new Date() : null,
              propertyOwnerId: owner?.id ?? null,
              ...split,
            },
            include: paymentWithTenantInclude,
          });
          await tx.auditLog.create({
            data: {
              userId,
              action: 'PAYMENT_RECORDED',
              resource: 'payment',
              resourceId: created.id,
              newValue: JSON.stringify(created),
            },
          });
          return { payment: created, created: true };
        },
        { maxWait: 30_000, timeout: 30_000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.payment.findUnique({
          where: { idempotencyKey: clientRequestId },
          include: paymentWithTenantInclude,
        });
        if (
          duplicate &&
          (duplicate.recordRequestFingerprint
            ? duplicate.recordRequestFingerprint === requestFingerprint
            : isSamePaymentRecordRequest(duplicate, data))
        ) {
          result = { payment: duplicate, created: false };
        } else if (data.referenceNumber) {
          const duplicateReference = await this.prisma.payment.findUnique({
            where: { referenceNumber: data.referenceNumber },
            select: { id: true },
          });
          if (duplicateReference) {
            throw new ConflictException(
              `Payment reference ${data.referenceNumber} is already recorded`,
            );
          }
          throw new ConflictException(
            'Payment request conflicts with an existing record',
          );
        } else {
          throw new ConflictException(
            'Payment request conflicts with an existing record',
          );
        }
      } else {
        throw error;
      }
    }

    const payment = result.payment;
    if (!result.created) return payment;

    const name = this.tenantName(payment.tenant);
    if (payment.status === PaymentStatus.OVERDUE) {
      await this.emails.sendLateNotice(
        payment.tenant.email,
        payment.rentAmount,
        payment.lateFee,
        payment.id,
        name,
      );
    } else if (payment.status === PaymentStatus.PENDING) {
      await this.emails.sendRentReminder(
        payment.tenant.email,
        payment.totalAmount,
        this.dueDate(payment.dueDate),
        payment.id,
        name,
      );
    } else {
      await this.emails.sendPaymentRecorded(
        payment.tenant.email,
        payment.paidAmount,
        payment.status,
        payment.id,
        payment.balanceDue,
        name,
        `${payment.id}-${payment.status}-${payment.updatedAt.toISOString()}`,
        { tenantId: payment.tenantId, unitId: payment.unitId },
      );
    }
    return payment;
  }

  async updatePaymentStatus(
    paymentId: string,
    data: {
      clientRequestId: string;
      status: PaymentStatus;
      paidAmount?: number;
      lateFee?: number;
      paymentMethod?: string;
      referenceNumber?: string;
      notes?: string;
      receiptUrl?: string;
      adjustmentReason?: string;
    },
    userId?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: paymentWithContextInclude,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.purpose !== PaymentPurpose.RENT) {
      throw new BadRequestException(
        'Use the move-in charge workflow for this payment',
      );
    }
    if (payment.lastStatusRequestId === data.clientRequestId) return payment;
    if (payment.stripeCheckoutStatus === StripeCheckoutStatus.OPEN) {
      throw new ConflictException(
        'A tenant-initiated online checkout is open for this payment. Wait for it to expire or complete before changing the payment manually.',
      );
    }
    const financialChangeRequested =
      data.status !== payment.status ||
      (data.paidAmount !== undefined &&
        data.paidAmount !== payment.paidAmount) ||
      (data.lateFee !== undefined && data.lateFee !== payment.lateFee);
    if (
      payment.stripeCheckoutStatus === StripeCheckoutStatus.COMPLETE &&
      financialChangeRequested
    ) {
      throw new ConflictException(
        'A Stripe-confirmed payment cannot be changed manually. Use the Stripe refund workflow, then record a separate audited correction if needed.',
      );
    }

    const lateFee = data.lateFee ?? payment.lateFee;
    if (lateFee !== payment.lateFee && !data.adjustmentReason?.trim()) {
      throw new BadRequestException(
        'A reason is required when changing a late fee',
      );
    }
    const totalAmount = payment.rentAmount + lateFee;
    const paidAmount =
      data.status === PaymentStatus.PAID && data.paidAmount === undefined
        ? totalAmount
        : (data.paidAmount ?? payment.paidAmount);
    if (paidAmount > totalAmount) {
      throw new BadRequestException('Paid amount cannot exceed the total due');
    }
    if (data.status === PaymentStatus.WAIVED && paidAmount > 0) {
      throw new BadRequestException(
        'A payment with money received cannot be waived; record it as paid or partial instead',
      );
    }
    const status =
      data.status === PaymentStatus.WAIVED
        ? PaymentStatus.WAIVED
        : paidAmount >= totalAmount
          ? PaymentStatus.PAID
          : data.status === PaymentStatus.OVERDUE
            ? PaymentStatus.OVERDUE
            : paidAmount > 0
              ? PaymentStatus.PARTIAL
              : PaymentStatus.PENDING;
    const balanceDue =
      status === PaymentStatus.WAIVED
        ? 0
        : Math.max(0, totalAmount - paidAmount);

    const isReceived = paidAmount > 0 && status !== PaymentStatus.WAIVED;
    const ownerId = payment.paidAt
      ? payment.propertyOwnerId
      : isReceived
        ? (payment.unit.property.owner?.id ?? null)
        : null;
    const rate = payment.paidAt
      ? payment.ownerCommissionRate
      : isReceived
        ? (payment.unit.property.owner?.commissionRate ?? null)
        : null;
    const split = this.splitPaidAmount(isReceived ? paidAmount : 0, rate);

    const statusData = {
      paymentMethod: data.paymentMethod,
      referenceNumber: data.referenceNumber,
      notes: data.notes,
      receiptUrl: data.receiptUrl,
    };
    let result:
      | { payment: PaymentWithContext; changed: true }
      | { changed: false };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const changed = await tx.payment.updateMany({
            where: { id: paymentId, updatedAt: payment.updatedAt },
            data: {
              ...statusData,
              lastStatusRequestId: data.clientRequestId,
              status,
              lateFee,
              totalAmount,
              paidAmount,
              balanceDue,
              paidAt: isReceived
                ? (payment.paidAt ?? new Date())
                : payment.paidAt,
              propertyOwnerId: ownerId,
              ...split,
            },
          });
          if (changed.count !== 1) {
            return { changed: false as const };
          }
          const updated = await tx.payment.findUniqueOrThrow({
            where: { id: paymentId },
            include: paymentWithContextInclude,
          });
          await tx.auditLog.create({
            data: {
              userId,
              action:
                lateFee !== payment.lateFee
                  ? 'PAYMENT_LATE_FEE_ADJUSTED'
                  : 'PAYMENT_UPDATED',
              resource: 'payment',
              resourceId: paymentId,
              oldValue: JSON.stringify(payment),
              newValue: JSON.stringify({
                payment: updated,
                adjustmentReason: data.adjustmentReason?.trim() || undefined,
              }),
            },
          });
          return { payment: updated, changed: true as const };
        },
        { maxWait: 30_000, timeout: 30_000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.payment.findUnique({
          where: { lastStatusRequestId: data.clientRequestId },
          include: paymentWithContextInclude,
        });
        if (duplicate?.id === paymentId) {
          return duplicate;
        } else {
          throw new ConflictException(
            'This status request ID was already used for another payment',
          );
        }
      } else {
        throw error;
      }
    }

    if (!result.changed) {
      const concurrent = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: paymentWithContextInclude,
      });
      if (concurrent?.lastStatusRequestId === data.clientRequestId) {
        return concurrent;
      }
      throw new ConflictException(
        'Payment changed; refresh before updating it',
      );
    }
    const updatedPayment = result.payment;

    const name = this.tenantName(updatedPayment.tenant);
    if (
      updatedPayment.status === PaymentStatus.OVERDUE &&
      payment.status !== PaymentStatus.OVERDUE
    ) {
      await this.emails.sendLateNotice(
        updatedPayment.tenant.email,
        updatedPayment.rentAmount,
        updatedPayment.lateFee,
        updatedPayment.id,
        name,
      );
    } else if (
      updatedPayment.status !== payment.status ||
      updatedPayment.paidAmount !== payment.paidAmount ||
      updatedPayment.lateFee !== payment.lateFee
    ) {
      await this.emails.sendPaymentRecorded(
        updatedPayment.tenant.email,
        updatedPayment.paidAmount,
        updatedPayment.status,
        updatedPayment.id,
        updatedPayment.balanceDue,
        name,
        `${updatedPayment.id}-${updatedPayment.status}-${updatedPayment.updatedAt.toISOString()}`,
        { tenantId: updatedPayment.tenantId, unitId: updatedPayment.unitId },
      );
    }
    return updatedPayment;
  }

  async startTenantCheckout(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenant: { userId } },
      include: paymentWithStripeContextInclude,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.purpose !== PaymentPurpose.RENT) {
      throw new BadRequestException(
        'Use the categorized move-in checkout for this balance',
      );
    }
    if (
      !(
        [
          PaymentStatus.PENDING,
          PaymentStatus.OVERDUE,
          PaymentStatus.PARTIAL,
        ] as PaymentStatus[]
      ).includes(payment.status) ||
      payment.balanceDue <= 0
    ) {
      throw new BadRequestException('This payment does not have an amount due');
    }
    if (
      payment.stripeCheckoutStatus === StripeCheckoutStatus.OPEN &&
      payment.stripeCheckoutUrl &&
      payment.stripeCheckoutExpiresAt &&
      payment.stripeCheckoutExpiresAt > new Date()
    ) {
      return {
        url: payment.stripeCheckoutUrl,
        expiresAt: payment.stripeCheckoutExpiresAt,
        reused: true,
      };
    }

    if (!this.stripe) {
      throw new BadRequestException(
        'Online rent payments are not configured yet',
      );
    }
    const owner = payment.unit.property.owner;
    if (!owner?.stripeConnectedAccountId) {
      throw new BadRequestException(
        'Online payment is unavailable until the property owner completes payout onboarding.',
      );
    }
    const account = await this.stripe.retrieveConnectedAccount(
      owner.stripeConnectedAccountId,
    );
    const capabilityStatus = this.stripe.ownerPaymentsStatus(account);
    const payoutReady = capabilityStatus === 'active';
    await this.syncOwnerPayoutReadiness(owner, capabilityStatus);
    if (!payoutReady) {
      throw new BadRequestException(
        'Online payment is unavailable until the property owner completes payout onboarding.',
      );
    }
    const amountCents = this.cents(payment.balanceDue);
    const rate = payment.ownerCommissionRate ?? owner.commissionRate;
    const commissionCents = Math.round(
      (amountCents * Number(rate.toString())) / 100,
    );
    const tenantUrl = process.env.TENANT_PORTAL_URL || 'http://localhost:3000';
    const successUrl = new URL('/tenant/pay-rent', tenantUrl);
    successUrl.searchParams.set('checkout', 'success');
    successUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
    const cancelUrl = new URL('/tenant/pay-rent', tenantUrl);
    cancelUrl.searchParams.set('checkout', 'cancelled');
    const session = await this.stripe.createCheckoutSession({
      paymentId: payment.id,
      tenantEmail: payment.tenant.email,
      propertyName: payment.unit.property.name,
      amountCents,
      commissionCents,
      connectedAccountId: owner.stripeConnectedAccountId,
      successUrl: successUrl.toString(),
      cancelUrl: cancelUrl.toString(),
      idempotencyKey: `rent-checkout-${payment.id}-${payment.updatedAt.getTime()}`,
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.payment.updateMany({
        where: { id: payment.id, updatedAt: payment.updatedAt },
        data: {
          propertyOwnerId: owner.id,
          ownerCommissionRate: rate,
          stripeCheckoutSessionId: session.id,
          stripeCheckoutUrl: session.url,
          stripeCheckoutStatus: StripeCheckoutStatus.OPEN,
          stripeCheckoutExpiresAt: new Date(session.expires_at * 1000),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Payment changed; refresh and retry');
      }
      await tx.auditLog.create({
        data: {
          userId,
          action: 'TENANT_RENT_CHECKOUT_STARTED',
          resource: 'payment',
          resourceId: payment.id,
          newValue: JSON.stringify({
            stripeCheckoutSessionId: session.id,
            amountCents,
            commissionCents,
          }),
        },
      });
      return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    });
    return {
      url: session.url,
      expiresAt: updated.stripeCheckoutExpiresAt,
      reused: false,
    };
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

  private async reconcileCheckoutCharge(
    paymentId: string,
    paymentIntentId: string | undefined,
  ) {
    if (!paymentIntentId || !this.stripe) return;
    const intent = await this.stripe.retrievePaymentIntent(paymentIntentId);
    const latestCharge = intent.latest_charge;
    const chargeId =
      typeof latestCharge === 'string'
        ? latestCharge
        : latestCharge && typeof latestCharge.id === 'string'
          ? latestCharge.id
          : undefined;
    const transfer =
      latestCharge && typeof latestCharge === 'object'
        ? latestCharge.transfer
        : undefined;
    const transferId =
      typeof transfer === 'string'
        ? transfer
        : transfer && typeof transfer.id === 'string'
          ? transfer.id
          : undefined;
    if (!chargeId && !transferId) return;
    await this.prisma.payment.updateMany({
      where: { id: paymentId },
      data: {
        stripePaymentIntentId: paymentIntentId,
        ...(chargeId ? { stripeChargeId: chargeId } : {}),
        ...(transferId ? { stripeTransferId: transferId } : {}),
        stripeLastEventAt: new Date(),
      },
    });
  }

  private async settleCheckout(session: Record<string, unknown>) {
    const paymentId = this.value(this.metadata(session), 'payment_id');
    const sessionId = this.value(session, 'id');
    const amountCents = this.numberValue(session, 'amount_total');
    if (!paymentId || !sessionId || amountCents === undefined) {
      throw new BadRequestException(
        'Stripe Checkout event is missing payment data',
      );
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: paymentWithStripeContextInclude,
    });
    if (!payment || payment.stripeCheckoutSessionId !== sessionId) {
      throw new BadRequestException(
        'Stripe Checkout session does not match a rent payment',
      );
    }
    if (amountCents !== this.cents(payment.balanceDue)) {
      throw new BadRequestException(
        'Stripe Checkout amount does not match balance due',
      );
    }
    const owner = payment.unit.property.owner;
    const rate = payment.ownerCommissionRate ?? owner?.commissionRate;
    if (!owner || !rate) {
      throw new BadRequestException(
        'Rent payment is missing property owner data',
      );
    }
    const paidAmount = payment.paidAmount + this.fromCents(amountCents);
    const split = this.splitPaidAmount(paidAmount, rate);
    const paymentIntentId = this.value(session, 'payment_intent');
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          stripeCheckoutSessionId: sessionId,
          stripeCheckoutStatus: { not: StripeCheckoutStatus.COMPLETE },
        },
        data: {
          status: PaymentStatus.PAID,
          paidAmount,
          balanceDue: 0,
          paidAt: new Date(),
          paymentMethod: 'stripe_checkout',
          propertyOwnerId: owner.id,
          ...split,
          stripeCheckoutStatus: StripeCheckoutStatus.COMPLETE,
          stripePaymentIntentId: paymentIntentId,
          stripePaymentMethodType: this.value(session, 'payment_method_type'),
          stripeLastEventAt: new Date(),
        },
      });
      if (changed.count !== 1) return { settled: false as const };
      const settled = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: paymentWithStripeContextInclude,
      });
      await tx.auditLog.create({
        data: {
          action: 'TENANT_RENT_PAYMENT_CONFIRMED_BY_STRIPE',
          resource: 'payment',
          resourceId: payment.id,
          newValue: JSON.stringify({
            stripeCheckoutSessionId: sessionId,
            stripePaymentIntentId: paymentIntentId,
            paidAmount,
            ownerProceedsAmount: settled.ownerProceedsAmount,
          }),
        },
      });
      return { settled: true as const, payment: settled };
    });
    if (!result.settled) {
      await this.reconcileCheckoutCharge(paymentId, paymentIntentId);
      return { paymentId, settled: false };
    }

    const settled = result.payment;
    await this.reconcileCheckoutCharge(settled.id, paymentIntentId);
    const tenantName = this.tenantName(settled.tenant);
    await this.emails.sendPaymentRecorded(
      settled.tenant.email,
      settled.paidAmount,
      settled.status,
      settled.id,
      settled.balanceDue,
      tenantName,
      `stripe-checkout-${sessionId}`,
      { tenantId: settled.tenantId, unitId: settled.unitId },
    );
    if (settled.ownerProceedsAmount && settled.ownerProceedsAmount.gt(0)) {
      await this.emails.sendOwnerPayout(
        owner.contactEmail,
        {
          name: owner.ownerName ?? owner.companyName ?? 'Property owner',
          amount: settled.ownerProceedsAmount.toFixed(2),
          propertyName: settled.unit.property.name,
        },
        `stripe-owner-proceeds-${settled.id}`,
      );
    }
    return { paymentId, settled: true };
  }

  private async updateCheckoutFailure(
    session: Record<string, unknown>,
    status: StripeCheckoutStatus,
    action: string,
  ) {
    const paymentId = this.value(this.metadata(session), 'payment_id');
    const sessionId = this.value(session, 'id');
    if (!paymentId || !sessionId) return undefined;
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.payment.updateMany({
        where: {
          id: paymentId,
          stripeCheckoutSessionId: sessionId,
          stripeCheckoutStatus: StripeCheckoutStatus.OPEN,
        },
        data: { stripeCheckoutStatus: status, stripeLastEventAt: new Date() },
      });
      if (changed.count === 1) {
        await tx.auditLog.create({
          data: { action, resource: 'payment', resourceId: paymentId },
        });
      }
      return changed.count === 1;
    });
    return { paymentId, changed: result };
  }

  private async processCharge(record: Record<string, unknown>, type: string) {
    if (!this.stripePaymentLedger) {
      throw new BadRequestException('Stripe payment ledger is unavailable');
    }
    return this.stripePaymentLedger.processCharge(record, type);
  }

  async requestStripeRefund(
    paymentId: string,
    data: { clientRequestId: string; amount: number; adjustmentReason: string },
    userId: string,
  ) {
    if (!this.stripePaymentLedger) {
      throw new BadRequestException('Stripe payment ledger is unavailable');
    }
    return this.stripePaymentLedger.requestStripeRefund(
      paymentId,
      data,
      userId,
    );
  }

  private async beginStripeWebhookEvent(event: StripeEvent | StripeThinEvent) {
    const payload = JSON.stringify(event);
    try {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          livemode: event.livemode,
          payload,
        },
      });
      return true;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const existing = await this.prisma.stripeWebhookEvent.findUnique({
        where: { stripeEventId: event.id },
        select: { status: true },
      });
      if (existing?.status !== StripeWebhookEventStatus.FAILED) return false;
      const claimed = await this.prisma.stripeWebhookEvent.updateMany({
        where: {
          stripeEventId: event.id,
          status: StripeWebhookEventStatus.FAILED,
        },
        data: {
          status: StripeWebhookEventStatus.RECEIVED,
          processingError: null,
          payload,
        },
      });
      return claimed.count === 1;
    }
  }

  async processStripeWebhook(event: StripeEvent) {
    if (!(await this.beginStripeWebhookEvent(event))) {
      return { received: true, duplicate: true };
    }

    try {
      let result: { paymentId?: string; ownerId?: string } | undefined;
      if (
        event.type === 'checkout.session.completed' &&
        this.value(event.data.object, 'payment_status') === 'paid'
      ) {
        result = await this.settleCheckout(event.data.object);
      } else if (event.type === 'checkout.session.async_payment_succeeded') {
        result = await this.settleCheckout(event.data.object);
      } else if (event.type === 'checkout.session.async_payment_failed') {
        result = await this.updateCheckoutFailure(
          event.data.object,
          StripeCheckoutStatus.FAILED,
          'TENANT_RENT_CHECKOUT_FAILED',
        );
      } else if (event.type === 'checkout.session.expired') {
        result = await this.updateCheckoutFailure(
          event.data.object,
          StripeCheckoutStatus.EXPIRED,
          'TENANT_RENT_CHECKOUT_EXPIRED',
        );
      } else if (
        [
          'charge.succeeded',
          'charge.refunded',
          'charge.dispute.created',
        ].includes(event.type)
      ) {
        result = await this.processCharge(event.data.object, event.type);
      } else if (
        event.type === 'v2.core.account[updated]' ||
        event.type === 'account.updated'
      ) {
        if (!this.stripePaymentLedger) {
          throw new BadRequestException('Stripe payment ledger is unavailable');
        }
        result = await this.stripePaymentLedger.processOwnerAccount(
          event.data.object,
        );
      }
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: result
            ? StripeWebhookEventStatus.PROCESSED
            : StripeWebhookEventStatus.IGNORED,
          paymentId: result?.paymentId,
          processedAt: new Date(),
        },
      });
      return { received: true, duplicate: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: StripeWebhookEventStatus.FAILED,
          processingError: message.slice(0, 4000),
        },
      });
      throw error;
    }
  }

  async processStripeConnectWebhook(event: StripeThinEvent) {
    if (!(await this.beginStripeWebhookEvent(event))) {
      return { received: true, duplicate: true };
    }

    try {
      let result: { ownerId?: string } | undefined;
      if (
        event.type ===
          'v2.core.account[configuration.recipient].capability_status_updated' ||
        event.type ===
          'v2.core.account[configuration.merchant].capability_status_updated'
      ) {
        if (!this.stripe) {
          throw new BadRequestException('Stripe Connect is not configured yet');
        }
        const account = await this.stripe.retrieveConnectedAccount(
          event.related_object!.id!,
        );
        if (!this.stripePaymentLedger) {
          throw new BadRequestException('Stripe payment ledger is unavailable');
        }
        result = await this.stripePaymentLedger.processOwnerAccount(account);
      }
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: result
            ? StripeWebhookEventStatus.PROCESSED
            : StripeWebhookEventStatus.IGNORED,
          processedAt: new Date(),
        },
      });
      return { received: true, duplicate: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.stripeWebhookEvent.update({
        where: { stripeEventId: event.id },
        data: {
          status: StripeWebhookEventStatus.FAILED,
          processingError: message.slice(0, 4000),
        },
      });
      throw error;
    }
  }

  async findOverdue() {
    return this.prisma.payment.findMany({
      where: {
        purpose: PaymentPurpose.RENT,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        dueDate: { lt: new Date() },
      },
      include: { tenant: true },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  }
}
