import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { Resend, type WebhookEventPayload } from 'resend';
import { getPortalUrls } from '../common/config/portal-urls';
import { PrismaService } from '../prisma/prisma.service';
import {
  type EmailTemplateKey,
  type EmailTemplateVariables,
  renderEmailTemplate,
} from './email-template.registry';

const RETRYABLE_STATUSES = ['PENDING', 'RETRY_PENDING'] as const;
const SUCCESS_STATUSES = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] as const;
const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0,
  PROCESSING: 1,
  RETRY_PENDING: 1,
  SENT: 2,
  DELIVERY_DELAYED: 3,
  DELIVERED: 4,
  OPENED: 5,
  CLICKED: 6,
  BOUNCED: 10,
  COMPLAINED: 10,
  FAILED: 10,
  SUPPRESSED: 10,
};

type EmailPage = {
  cursor?: string;
  limit?: number;
  status?: string;
  tenantOnly?: boolean;
};

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();
    this.from =
      this.configService.get<string>('RESEND_FROM_EMAIL')?.trim() ||
      'Coach Johnson Realty <onboarding@resend.dev>';
    this.resend =
      apiKey && apiKey !== 're_your_api_key_here' ? new Resend(apiKey) : null;
    if (!this.resend) {
      this.logger.warn('Resend is not configured. Emails will be logged only.');
    }
  }

  private logicalKey(
    templateKey: EmailTemplateKey,
    recipient: string,
    eventKey?: string,
  ) {
    const recipientHash = createHash('sha256')
      .update(recipient.trim().toLowerCase())
      .digest('hex')
      .slice(0, 16);
    const event = (eventKey || randomUUID()).replace(/[^a-zA-Z0-9._/-]/g, '-');
    return `${templateKey}/${event}/${recipientHash}`.slice(0, 256);
  }

  private nextRetry(attemptCount: number) {
    const delays = [60_000, 5 * 60_000, 15 * 60_000];
    return new Date(Date.now() + (delays[attemptCount - 1] ?? 15 * 60_000));
  }

  private retryable(error: unknown) {
    if (!(error && typeof error === 'object')) return true;
    const status = 'statusCode' in error ? Number(error.statusCode) : NaN;
    return !Number.isFinite(status) || status === 429 || status >= 500;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.slice(0, 2000);
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message).slice(0, 2000);
    }
    return String(error).slice(0, 2000);
  }

  async sendTemplate(
    to: string,
    templateKey: EmailTemplateKey,
    values: EmailTemplateVariables,
    eventKey?: string,
    context: {
      tenantId?: string;
      propertyId?: string;
      unitId?: string;
      sentByUserId?: string;
      batchId?: string;
    } = {},
  ) {
    const recipient = to.trim().toLowerCase();
    if (!recipient) return null;
    const rendered = renderEmailTemplate(templateKey, values);
    const idempotencyKey = this.logicalKey(templateKey, recipient, eventKey);
    let log;
    try {
      log = await this.prisma.emailLog.upsert({
        where: { idempotencyKey },
        create: {
          to: recipient,
          subject: rendered.subject,
          body: rendered.html,
          templateKey: rendered.key,
          templateVersion: rendered.version,
          critical: rendered.critical,
          maxAttempts: rendered.maxAttempts,
          ...context,
          idempotencyKey,
          providerIdempotencyKey: idempotencyKey,
          status: this.resend ? 'PENDING' : 'NOT_CONFIGURED',
        },
        update: {},
      });
    } catch (error) {
      this.logger.error(
        `Unable to persist ${templateKey} email`,
        this.errorMessage(error),
      );
      return null;
    }
    if (
      SUCCESS_STATUSES.includes(
        log.status as (typeof SUCCESS_STATUSES)[number],
      ) ||
      log.status === 'PROCESSING' ||
      !this.resend
    ) {
      return log;
    }
    await this.deliver(log.id);
    return this.prisma.emailLog.findUnique({ where: { id: log.id } });
  }

  private async deliver(id: string) {
    if (!this.resend) return false;
    const current = await this.prisma.emailLog.findUnique({ where: { id } });
    if (
      !current ||
      !RETRYABLE_STATUSES.includes(
        current.status as (typeof RETRYABLE_STATUSES)[number],
      ) ||
      current.attemptCount >= current.maxAttempts
    ) {
      return false;
    }
    const claimed = await this.prisma.emailLog.updateMany({
      where: {
        id,
        status: current.status,
        attemptCount: current.attemptCount,
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        nextRetryAt: null,
        lastError: null,
      },
    });
    if (claimed.count !== 1) return false;
    const log = await this.prisma.emailLog.findUniqueOrThrow({ where: { id } });
    try {
      const { data, error } = await this.resend.emails.send(
        {
          from: this.from,
          to: log.to,
          subject: log.subject,
          html: log.body ?? '',
          tags: [
            { name: 'template', value: log.templateKey.replaceAll('.', '_') },
            { name: 'version', value: String(log.templateVersion) },
            { name: 'email_log_id', value: log.id },
          ],
        },
        { idempotencyKey: log.providerIdempotencyKey },
      );
      if (error) {
        const rejected = new Error(error.message);
        if ('statusCode' in error) {
          Object.assign(rejected, { statusCode: error.statusCode });
        }
        throw rejected;
      }
      await this.prisma.emailLog.update({
        where: { id },
        data: {
          status: 'SENT',
          resendEmailId: data?.id,
          sentAt: new Date(),
          nextRetryAt: null,
        },
      });
      this.logger.log(`Email accepted by Resend: ${data?.id ?? id}`);
      return true;
    } catch (error) {
      const shouldRetry =
        log.critical &&
        log.attemptCount < log.maxAttempts &&
        this.retryable(error);
      await this.prisma.emailLog.update({
        where: { id },
        data: {
          status: shouldRetry ? 'RETRY_PENDING' : 'FAILED',
          failedAt: shouldRetry ? null : new Date(),
          nextRetryAt: shouldRetry ? this.nextRetry(log.attemptCount) : null,
          lastError: this.errorMessage(error),
        },
      });
      this.logger.error(
        `Email delivery attempt failed for log ${id}`,
        this.errorMessage(error),
      );
      return false;
    }
  }

  async retryDue(limit = 25) {
    if (!this.resend) {
      throw new ServiceUnavailableException('Resend is not configured');
    }
    const due = await this.prisma.emailLog.findMany({
      where: { status: 'RETRY_PENDING', nextRetryAt: { lte: new Date() } },
      select: { id: true },
      orderBy: [{ nextRetryAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(limit, 1), 50),
    });
    const outcomes = await Promise.all(due.map(({ id }) => this.deliver(id)));
    return { claimed: due.length, sent: outcomes.filter(Boolean).length };
  }

  async retryOne(id: string, tenantOnly = false) {
    const log = await this.prisma.emailLog.findUnique({ where: { id } });
    if (!log || (tenantOnly && !log.tenantId))
      throw new NotFoundException('Email log not found');
    if (
      SUCCESS_STATUSES.includes(log.status as (typeof SUCCESS_STATUSES)[number])
    ) {
      throw new BadRequestException('Successful email cannot be retried');
    }
    await this.prisma.emailLog.update({
      where: { id },
      data: {
        status: 'RETRY_PENDING',
        nextRetryAt: new Date(),
        providerIdempotencyKey:
          `${log.idempotencyKey}/manual/${randomUUID()}`.slice(0, 256),
        ...(log.attemptCount >= log.maxAttempts
          ? { maxAttempts: log.attemptCount + 1 }
          : {}),
      },
    });
    await this.deliver(id);
    return this.prisma.emailLog.findUnique({
      where: { id },
      select: this.adminSelect(),
    });
  }

  private adminSelect() {
    return {
      id: true,
      to: true,
      subject: true,
      templateKey: true,
      templateVersion: true,
      status: true,
      critical: true,
      resendEmailId: true,
      attemptCount: true,
      maxAttempts: true,
      nextRetryAt: true,
      lastError: true,
      sentAt: true,
      deliveredAt: true,
      openedAt: true,
      clickedAt: true,
      bouncedAt: true,
      complainedAt: true,
      failedAt: true,
      suppressedAt: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.EmailLogSelect;
  }

  async list(page: EmailPage = {}) {
    const limit = Math.min(Math.max(page.limit ?? 25, 1), 100);
    const rows = await this.prisma.emailLog.findMany({
      where: page.tenantOnly
        ? {
            tenantId: { not: null },
            ...(page.status ? { status: page.status } : {}),
          }
        : page.status
          ? { status: page.status }
          : undefined,
      select: this.adminSelect(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async handleWebhook(
    payload: string,
    headers: { id: string; timestamp: string; signature: string },
  ) {
    const secret = this.configService
      .get<string>('RESEND_WEBHOOK_SECRET')
      ?.trim();
    if (!this.resend || !secret) {
      throw new ServiceUnavailableException('Resend webhook is not configured');
    }
    let event: WebhookEventPayload;
    try {
      event = this.resend.webhooks.verify({
        payload,
        headers,
        webhookSecret: secret,
      });
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }
    if (!event.type.startsWith('email.') || !('email_id' in event.data)) {
      return { received: true, tracked: false };
    }
    const eventData = event.data as typeof event.data & {
      email_id: string;
      tags?: Record<string, string>;
    };
    let log = await this.prisma.emailLog.findUnique({
      where: { resendEmailId: eventData.email_id },
    });
    const logIdTag = eventData.tags?.email_log_id;
    if (!log && logIdTag) {
      log = await this.prisma.emailLog.findUnique({ where: { id: logIdTag } });
      if (log && !log.resendEmailId) {
        log = await this.prisma.emailLog.update({
          where: { id: log.id },
          data: { resendEmailId: eventData.email_id },
        });
      }
    }
    if (!log) return { received: true, tracked: false };
    const providerCreatedAt = new Date(event.created_at);
    const incomingStatus = event.type.replace('email.', '').toUpperCase();
    await this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.emailEvent.findUnique({
        where: { providerEventId: headers.id },
        select: { id: true },
      });
      if (duplicate) return;
      const current = await tx.emailLog.findUniqueOrThrow({
        where: { id: log.id },
      });
      await tx.emailEvent.create({
        data: {
          emailLogId: log.id,
          providerEventId: headers.id,
          type: event.type,
          providerCreatedAt,
          payload: event.data as unknown as Prisma.InputJsonValue,
        },
      });
      const status =
        (STATUS_PRIORITY[incomingStatus] ?? 0) >=
        (STATUS_PRIORITY[current.status] ?? 0)
          ? incomingStatus
          : current.status;
      const timestampField: Record<
        string,
        keyof Prisma.EmailLogUncheckedUpdateInput
      > = {
        'email.sent': 'sentAt',
        'email.delivered': 'deliveredAt',
        'email.opened': 'openedAt',
        'email.clicked': 'clickedAt',
        'email.bounced': 'bouncedAt',
        'email.complained': 'complainedAt',
        'email.failed': 'failedAt',
        'email.suppressed': 'suppressedAt',
      };
      const field = timestampField[event.type];
      await tx.emailLog.update({
        where: { id: log.id },
        data: {
          status,
          ...(field ? { [field]: providerCreatedAt } : {}),
          ...(event.type === 'email.delivered' ? { body: null } : {}),
          ...(['email.bounced', 'email.failed', 'email.suppressed'].includes(
            event.type,
          )
            ? { nextRetryAt: null }
            : {}),
        },
      });
    });
    return { received: true, tracked: true };
  }

  portal(
    path: string,
    portal: 'tenant' | 'rentalAdmin' | 'propertiesAdmin' | 'agent',
  ) {
    return `${getPortalUrls(this.configService)[portal]}${path}`;
  }

  sendAgentVerification(
    email: string,
    name: string,
    url: string,
    eventKey?: string,
  ) {
    return this.sendTemplate(
      email,
      'agent.verification',
      { name, url },
      eventKey,
    );
  }

  sendAgentApproved(email: string, name: string, eventKey?: string) {
    return this.sendTemplate(email, 'agent.approved', { name }, eventKey);
  }

  sendAgentDeclined(
    email: string,
    name: string,
    reason: string,
    eventKey?: string,
  ) {
    return this.sendTemplate(
      email,
      'agent.declined',
      { name, reason },
      eventKey,
    );
  }

  sendAgentResubmissionReceived(
    email: string,
    name: string,
    eventKey?: string,
  ) {
    return this.sendTemplate(
      email,
      'agent.resubmission_received',
      { name },
      eventKey,
    );
  }

  sendAgentResubmittedForReview(
    email: string,
    companyName: string,
    contactName: string,
    agentId: string,
  ) {
    return this.sendTemplate(
      email,
      'agent.resubmitted_for_review',
      {
        companyName,
        contactName,
        url: this.portal(
          `/admin/agents?id=${encodeURIComponent(agentId)}&status=PENDING`,
          'propertiesAdmin',
        ),
      },
      `agent-${agentId}`,
    );
  }

  sendListingSubmitted(
    email: string,
    listingName: string,
    companyName: string,
    listingId: string,
    resubmission: boolean,
  ) {
    return this.sendTemplate(
      email,
      resubmission ? 'sale_listing.resubmitted' : 'sale_listing.submitted',
      {
        listingName,
        companyName,
        url: this.portal(
          `/admin/listings?id=${encodeURIComponent(listingId)}`,
          'propertiesAdmin',
        ),
      },
      `listing-${listingId}`,
    );
  }

  sendListingApproved(
    email: string,
    name: string,
    listingName: string,
    listingId?: string,
  ) {
    return this.sendTemplate(
      email,
      'sale_listing.approved',
      { name, listingName },
      listingId,
    );
  }

  sendListingRejected(
    email: string,
    name: string,
    listingName: string,
    reason: string,
    listingId?: string,
  ) {
    return this.sendTemplate(
      email,
      'sale_listing.rejected',
      { name, listingName, reason },
      listingId,
    );
  }

  sendBuyerInquiryToAgent(
    email: string,
    name: string,
    listingName: string,
    buyerName: string,
    inquiryId: string,
  ) {
    return this.sendTemplate(
      email,
      'buyer_inquiry.created',
      {
        name,
        listingName,
        buyerName,
        url: this.portal(
          `/agent/inquiries?id=${encodeURIComponent(inquiryId)}`,
          'agent',
        ),
      },
      inquiryId,
    );
  }

  sendBuyerReplyToAgent(
    email: string,
    name: string,
    listingName: string,
    buyerName: string,
    inquiryId: string,
    messageId?: string,
  ) {
    return this.sendTemplate(
      email,
      'buyer_inquiry.buyer_replied',
      {
        name,
        listingName,
        buyerName,
        url: this.portal(
          `/agent/inquiries?id=${encodeURIComponent(inquiryId)}`,
          'agent',
        ),
      },
      messageId ?? inquiryId,
    );
  }

  sendAgentReplyToBuyer(
    email: string,
    name: string,
    listingName: string,
    agentName: string,
    messageId?: string,
  ) {
    return this.sendTemplate(
      email,
      'buyer_inquiry.agent_replied',
      { name, listingName, agentName },
      messageId,
    );
  }

  sendInvite(email: string, url: string, name?: string, tenantId?: string) {
    return this.sendTemplate(email, 'tenant.invited', { name, url }, tenantId);
  }

  sendPasswordReset(email: string, url: string) {
    return this.sendTemplate(email, 'account.password_reset', { url });
  }

  sendRentalPublished(
    email: string,
    name: string,
    propertyName: string,
    address: string,
    propertyId: string,
    published: boolean,
  ) {
    return this.sendTemplate(
      email,
      published ? 'rental.published' : 'rental.unpublished',
      { name, propertyName, address },
      `${propertyId}-${published ? 'published' : 'unpublished'}`,
    );
  }

  sendLeaseCreated(
    email: string,
    values: EmailTemplateVariables,
    leaseId: string,
  ) {
    return this.sendTemplate(
      email,
      'lease.created',
      { ...values, url: this.portal('/tenant/lease', 'tenant') },
      leaseId,
    );
  }

  sendLeaseStatusUpdated(
    email: string,
    values: EmailTemplateVariables,
    eventKey: string,
  ) {
    return this.sendTemplate(
      email,
      'lease.status_updated',
      { ...values, url: this.portal('/tenant/lease', 'tenant') },
      eventKey,
    );
  }

  sendRentReminder(
    email: string,
    amount: number,
    dueDate: string,
    paymentId?: string,
    name?: string,
  ) {
    return this.sendTemplate(
      email,
      'rent.reminder',
      {
        amount,
        dueDate,
        name,
        url: this.portal('/tenant/payments', 'tenant'),
      },
      paymentId,
    );
  }

  sendLateNotice(
    email: string,
    amount: number,
    lateFee: number,
    paymentId?: string,
    name?: string,
  ) {
    return this.sendTemplate(
      email,
      'rent.late_notice',
      {
        amount,
        lateFee,
        total: amount + lateFee,
        name,
        url: this.portal('/tenant/payments', 'tenant'),
      },
      paymentId,
    );
  }

  sendPaymentRecorded(
    email: string,
    amount: number,
    status: string,
    paymentId?: string,
    balanceDue = 0,
    name?: string,
    eventKey?: string,
    context: { tenantId?: string; propertyId?: string; unitId?: string; sentByUserId?: string } = {},
  ) {
    return this.sendTemplate(
      email,
      'rent.payment_recorded',
      {
        amount,
        status,
        balanceDue,
        name,
        url: this.portal('/tenant/payments', 'tenant'),
      },
      eventKey ?? paymentId,
      context,
    );
  }

  sendMoveInChargesPosted(
    email: string,
    values: EmailTemplateVariables,
    eventKey: string,
  ) {
    return this.sendTemplate(
      email,
      'move_in.charges_posted',
      { ...values, url: this.portal('/tenant/pay-rent', 'tenant') },
      eventKey,
    );
  }

  sendMoveInPaymentRecorded(
    email: string,
    values: EmailTemplateVariables,
    eventKey: string,
  ) {
    return this.sendTemplate(
      email,
      'move_in.payment_recorded',
      { ...values, url: this.portal('/tenant/payments', 'tenant') },
      eventKey,
    );
  }

  sendMaintenanceCreated(
    email: string,
    values: EmailTemplateVariables,
    requestId: string,
  ) {
    return this.sendTemplate(
      email,
      'maintenance.created',
      {
        ...values,
        url: this.portal(
          `/admin/maintenance?id=${encodeURIComponent(requestId)}`,
          'rentalAdmin',
        ),
      },
      requestId,
    );
  }

  sendMaintenanceUpdate(
    email: string,
    requestId: string,
    status: string,
    category?: string,
    name?: string,
  ) {
    return this.sendTemplate(
      email,
      'maintenance.updated',
      {
        requestId,
        status,
        category,
        name,
        url: this.portal('/tenant/maintenance', 'tenant'),
      },
      `${requestId}-${status}`,
    );
  }

  sendMaintenanceVendorAssignment(
    email: string,
    values: EmailTemplateVariables,
    eventKey: string,
  ) {
    const key = 'maintenance.vendor_assigned' as const;
    return this.sendTemplate(email, key, values, eventKey);
  }

  sendMaintenanceCompletionConfirmed(
    email: string,
    values: EmailTemplateVariables,
    requestId: string,
  ) {
    return this.sendTemplate(
      email,
      'maintenance.completion_confirmed',
      {
        ...values,
        requestId,
        url: this.portal(
          `/admin/maintenance?id=${encodeURIComponent(requestId)}`,
          'rentalAdmin',
        ),
      },
      requestId,
    );
  }

  sendTenantMessageToAdmin(
    email: string,
    values: EmailTemplateVariables,
    messageId: string,
  ) {
    return this.sendTemplate(
      email,
      'tenant_message.created',
      { ...values, url: this.portal('/admin/messages', 'rentalAdmin') },
      messageId,
    );
  }

  sendAdminReplyToTenant(
    email: string,
    values: EmailTemplateVariables,
    messageId: string,
  ) {
    return this.sendTemplate(
      email,
      'tenant_message.admin_replied',
      { ...values, url: this.portal('/tenant/messages', 'tenant') },
      messageId,
    );
  }

  sendRentalApplicationSubmitted(
    email: string,
    values: EmailTemplateVariables,
    applicationId: string,
  ) {
    return this.sendTemplate(
      email,
      'rental_application.submitted',
      values,
      applicationId,
    );
  }

  sendRentalApplicationStatus(
    email: string,
    values: EmailTemplateVariables,
    eventKey: string,
  ) {
    return this.sendTemplate(
      email,
      'rental_application.status_updated',
      values,
      eventKey,
    );
  }

  sendOwnerStripeOnboardingInvitation(
    email: string,
    values: EmailTemplateVariables,
    ownerId: string,
  ) {
    return this.sendTemplate(
      email,
      'owner.stripe_onboarding_invited',
      values,
      ownerId,
    );
  }

  sendOwnerStripeOnboardingCompleted(
    email: string,
    values: EmailTemplateVariables,
    ownerId: string,
  ) {
    return this.sendTemplate(
      email,
      'owner.stripe_onboarding_completed',
      values,
      ownerId,
    );
  }

  sendOwnerPayout(
    email: string,
    values: EmailTemplateVariables,
    payoutId: string,
  ) {
    return this.sendTemplate(email, 'owner.payout_sent', values, payoutId);
  }

  sendOwnerStatement(
    email: string,
    values: EmailTemplateVariables,
    statementId: string,
  ) {
    return this.sendTemplate(
      email,
      'owner.statement_ready',
      values,
      statementId,
    );
  }
}
