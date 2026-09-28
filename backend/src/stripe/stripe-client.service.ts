import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyStripeWebhookPayload } from './stripe-webhook-verifier';

const STRIPE_API_URL = 'https://api.stripe.com';
const STRIPE_API_VERSION = '2026-07-29.dahlia';

type StripeErrorResponse = {
  error?: { message?: string; type?: string; code?: string };
};

type StripeCheckoutSession = {
  id: string;
  url: string;
  expires_at: number;
  payment_intent?: string | null;
  payment_status?: string;
  amount_total?: number | null;
  metadata?: Record<string, string>;
};

export type StripeEvent = {
  id: string;
  type: string;
  livemode: boolean;
  data: { object: Record<string, unknown> };
};

export type StripeThinEvent = {
  id: string;
  type: string;
  livemode: boolean;
  related_object?: { id?: string; type?: string };
};

type StripeAccount = { id: string };

type StripePaymentIntent = {
  id: string;
  metadata?: Record<string, string>;
  latest_charge?:
    | string
    | { id?: string; transfer?: string | { id?: string } | null }
    | null;
};

type StripeDispute = { id: string; amount: number };

type StripeTransferReversal = { id: string };

function appendFormValue(
  form: URLSearchParams,
  key: string,
  value: string | number | boolean | null | undefined,
) {
  if (value !== undefined && value !== null) form.append(key, String(value));
}

@Injectable()
export class StripeClient {
  private readonly logger = new Logger(StripeClient.name);

  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return (
      this.config.get<string>('STRIPE_RENT_PAYMENTS_ENABLED')?.toLowerCase() ===
      'true'
    );
  }

  get applicationFeesEnabled() {
    const configured = this.config.get<string>(
      'STRIPE_APPLICATION_FEES_ENABLED',
    );
    return configured == null
      ? this.enabled
      : configured.toLowerCase() === 'true';
  }

  private secretKey(feature: 'rent' | 'application' = 'rent') {
    const key = this.config.get<string>('STRIPE_SECRET_KEY')?.trim();
    const featureEnabled =
      feature === 'rent' ? this.enabled : this.applicationFeesEnabled;
    if (!featureEnabled || !key || key.includes('replace_with')) {
      throw new ServiceUnavailableException(
        feature === 'rent'
          ? 'Online rent payments are not configured yet'
          : 'Online application fees are not configured yet',
      );
    }
    return key;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    idempotencyKey?: string,
    feature: 'rent' | 'application' = 'rent',
  ) {
    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(), 15_000);
    try {
      const response = await fetch(`${STRIPE_API_URL}${path}`, {
        ...init,
        signal: timeout.signal,
        headers: {
          Authorization: `Bearer ${this.secretKey(feature)}`,
          'Stripe-Version': STRIPE_API_VERSION,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...init.headers,
        },
      });
      const payload = (await response.json().catch(() => ({}))) as T &
        StripeErrorResponse;
      if (!response.ok) {
        const message = payload.error?.message || 'Stripe request failed';
        this.logger.error(
          `Stripe ${init.method ?? 'GET'} ${path} failed: ${response.status} ${payload.error?.type ?? 'unknown'}`,
        );
        throw new BadRequestException(message);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Stripe ${init.method ?? 'GET'} ${path} unavailable`);
      throw new ServiceUnavailableException(
        'The payment processor is temporarily unavailable. Please try again.',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private postForm<T>(
    path: string,
    form: URLSearchParams,
    idempotencyKey?: string,
    feature: 'rent' | 'application' = 'rent',
    extraHeaders: Record<string, string> = {},
  ) {
    return this.request<T>(
      path,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...extraHeaders,
        },
        body: form.toString(),
      },
      idempotencyKey,
      feature,
    );
  }

  async createCheckoutSession(input: {
    paymentId: string;
    tenantEmail: string;
    propertyName: string;
    amountCents: number;
    commissionCents: number;
    connectedAccountId: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }) {
    const form = new URLSearchParams();
    appendFormValue(form, 'mode', 'payment');
    appendFormValue(form, 'customer_email', input.tenantEmail);
    appendFormValue(form, 'client_reference_id', input.paymentId);
    appendFormValue(form, 'success_url', input.successUrl);
    appendFormValue(form, 'cancel_url', input.cancelUrl);
    appendFormValue(
      form,
      'integration_identifier',
      'coach_johnson_rent_checkout_qwfrtnks',
    );
    appendFormValue(form, 'metadata[payment_id]', input.paymentId);
    appendFormValue(
      form,
      'payment_intent_data[metadata][payment_id]',
      input.paymentId,
    );
    appendFormValue(
      form,
      'payment_intent_data[application_fee_amount]',
      input.commissionCents,
    );
    appendFormValue(form, 'line_items[0][quantity]', 1);
    appendFormValue(form, 'line_items[0][price_data][currency]', 'usd');
    appendFormValue(
      form,
      'line_items[0][price_data][unit_amount]',
      input.amountCents,
    );
    appendFormValue(
      form,
      'line_items[0][price_data][product_data][name]',
      `Rent payment — ${input.propertyName}`.slice(0, 250),
    );
    // Intentionally omit payment_method_types. Stripe Dashboard dynamic payment
    // methods decide which eligible one-time methods are offered to the tenant.
    return this.postForm<StripeCheckoutSession>(
      '/v1/checkout/sessions',
      form,
      input.idempotencyKey,
      'rent',
      { 'Stripe-Account': input.connectedAccountId },
    );
  }

  async createMoveInCheckoutSession(input: {
    paymentId: string;
    tenantEmail: string;
    lineItems: Array<{ name: string; amountCents: number }>;
    managementAmountCents: number;
    destinationAccountId?: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }) {
    const form = new URLSearchParams();
    appendFormValue(form, 'mode', 'payment');
    appendFormValue(form, 'customer_email', input.tenantEmail);
    appendFormValue(form, 'client_reference_id', input.paymentId);
    appendFormValue(form, 'success_url', input.successUrl);
    appendFormValue(form, 'cancel_url', input.cancelUrl);
    appendFormValue(
      form,
      'integration_identifier',
      'coach_johnson_move_in_checkout_ajqlvngp',
    );
    appendFormValue(form, 'metadata[move_in_payment_id]', input.paymentId);
    appendFormValue(
      form,
      'payment_intent_data[metadata][move_in_payment_id]',
      input.paymentId,
    );
    if (input.destinationAccountId) {
      appendFormValue(
        form,
        'payment_intent_data[application_fee_amount]',
        input.managementAmountCents,
      );
    }
    input.lineItems.forEach((item, index) => {
      appendFormValue(form, `line_items[${index}][quantity]`, 1);
      appendFormValue(
        form,
        `line_items[${index}][price_data][currency]`,
        'usd',
      );
      appendFormValue(
        form,
        `line_items[${index}][price_data][unit_amount]`,
        item.amountCents,
      );
      appendFormValue(
        form,
        `line_items[${index}][price_data][product_data][name]`,
        item.name.slice(0, 250),
      );
    });
    // Dynamic payment methods remain controlled in Stripe Dashboard. This is
    // always a tenant-initiated, one-time Checkout Session—never an auto debit.
    return this.postForm<StripeCheckoutSession>(
      '/v1/checkout/sessions',
      form,
      input.idempotencyKey,
      'rent',
      input.destinationAccountId
        ? { 'Stripe-Account': input.destinationAccountId }
        : {},
    );
  }

  async createApplicationFeeCheckoutSession(input: {
    applicationId: string;
    applicantEmail: string;
    propertyName: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }) {
    const form = new URLSearchParams();
    appendFormValue(form, 'mode', 'payment');
    appendFormValue(form, 'customer_email', input.applicantEmail);
    appendFormValue(form, 'client_reference_id', input.applicationId);
    appendFormValue(form, 'success_url', input.successUrl);
    appendFormValue(form, 'cancel_url', input.cancelUrl);
    appendFormValue(
      form,
      'integration_identifier',
      'coach_johnson_application_fee_applyfee_zmxpcrae',
    );
    appendFormValue(
      form,
      'metadata[rental_application_id]',
      input.applicationId,
    );
    appendFormValue(
      form,
      'payment_intent_data[metadata][rental_application_id]',
      input.applicationId,
    );
    appendFormValue(form, 'line_items[0][quantity]', 1);
    appendFormValue(form, 'line_items[0][price_data][currency]', 'usd');
    appendFormValue(
      form,
      'line_items[0][price_data][unit_amount]',
      input.amountCents,
    );
    appendFormValue(
      form,
      'line_items[0][price_data][product_data][name]',
      `Rental application fee — ${input.propertyName}`.slice(0, 250),
    );
    return this.postForm<StripeCheckoutSession>(
      '/v1/checkout/sessions',
      form,
      input.idempotencyKey,
      'application',
    );
  }

  async createMerchantAccount(input: {
    ownerId: string;
    email: string;
    businessName?: string | null;
    idempotencyKey: string;
  }) {
    return this.request<StripeAccount>(
      '/v2/core/accounts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_email: input.email,
          dashboard: 'full',
          defaults: {
            profile: input.businessName
              ? { doing_business_as: input.businessName }
              : undefined,
            responsibilities: {
              fees_collector: 'stripe',
              losses_collector: 'stripe',
            },
          },
          configuration: {
            merchant: {
              capabilities: {
                card_payments: { requested: true },
              },
            },
          },
          metadata: { property_owner_id: input.ownerId },
        }),
      },
      input.idempotencyKey,
    );
  }

  async createAccountOnboardingLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
    idempotencyKey: string;
  }) {
    const form = new URLSearchParams();
    appendFormValue(form, 'account', input.accountId);
    appendFormValue(form, 'refresh_url', input.refreshUrl);
    appendFormValue(form, 'return_url', input.returnUrl);
    appendFormValue(form, 'type', 'account_onboarding');
    return this.postForm<{ url: string }>(
      '/v1/account_links',
      form,
      input.idempotencyKey,
    );
  }

  verifyWebhook(payload: Buffer, signatureHeader?: string) {
    const event = verifyStripeWebhookPayload(
      this.config,
      this.enabled || this.applicationFeesEnabled,
      payload,
      signatureHeader,
      'STRIPE_WEBHOOK_SECRET',
    ) as StripeEvent;
    if (!event.id || !event.type || !event.data?.object) {
      throw new BadRequestException('Invalid Stripe webhook payload');
    }
    return event;
  }

  verifyConnectWebhook(payload: Buffer, signatureHeader?: string) {
    const event = verifyStripeWebhookPayload(
      this.config,
      this.enabled || this.applicationFeesEnabled,
      payload,
      signatureHeader,
      'STRIPE_CONNECT_WEBHOOK_SECRET',
    ) as StripeThinEvent;
    if (!event.id || !event.type || !event.related_object?.id) {
      throw new BadRequestException('Invalid Stripe Connect webhook payload');
    }
    return event;
  }

  async retrieveConnectedAccount(accountId: string) {
    return this.request<Record<string, unknown>>(
      `/v2/core/accounts/${encodeURIComponent(accountId)}?include[]=configuration.merchant&include[]=configuration.recipient`,
      { method: 'GET' },
    );
  }

  merchantPaymentsStatus(account: Record<string, unknown>) {
    const configuration = account.configuration;
    const merchant =
      configuration && typeof configuration === 'object'
        ? (configuration as Record<string, unknown>).merchant
        : undefined;
    const capabilities =
      merchant && typeof merchant === 'object'
        ? (merchant as Record<string, unknown>).capabilities
        : undefined;
    const cardPayments =
      capabilities && typeof capabilities === 'object'
        ? (capabilities as Record<string, unknown>).card_payments
        : undefined;
    if (!cardPayments || typeof cardPayments !== 'object') return undefined;
    const status = (cardPayments as Record<string, unknown>).status;
    return typeof status === 'string' ? status : undefined;
  }

  ownerPaymentsStatus(account: Record<string, unknown>) {
    return (
      this.merchantPaymentsStatus(account) ??
      this.recipientTransferStatus(account)
    );
  }

  recipientTransferStatus(account: Record<string, unknown>) {
    const configuration = account.configuration;
    const recipient =
      configuration && typeof configuration === 'object'
        ? (configuration as Record<string, unknown>).recipient
        : undefined;
    const capabilities =
      recipient && typeof recipient === 'object'
        ? (recipient as Record<string, unknown>).capabilities
        : undefined;
    const balance =
      capabilities && typeof capabilities === 'object'
        ? (capabilities as Record<string, unknown>).stripe_balance
        : undefined;
    const transfers =
      balance && typeof balance === 'object'
        ? (balance as Record<string, unknown>).stripe_transfers
        : undefined;
    if (!transfers || typeof transfers !== 'object') return undefined;
    const status = (transfers as Record<string, unknown>).status;
    return typeof status === 'string' ? status : undefined;
  }

  recipientTransfersActive(account: Record<string, unknown>) {
    return this.recipientTransferStatus(account) === 'active';
  }

  async retrievePaymentIntent(paymentIntentId: string) {
    return this.request<StripePaymentIntent>(
      `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`,
      { method: 'GET' },
    );
  }

  async createDestinationChargeRefund(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
    connectedAccountId?: string;
  }) {
    const form = new URLSearchParams();
    appendFormValue(form, 'payment_intent', input.paymentIntentId);
    appendFormValue(form, 'amount', input.amountCents);
    if (!input.connectedAccountId) {
      appendFormValue(form, 'reverse_transfer', true);
      appendFormValue(form, 'refund_application_fee', true);
    }
    return this.postForm<{ id: string; status: string }>(
      '/v1/refunds',
      form,
      input.idempotencyKey,
      'rent',
      input.connectedAccountId
        ? { 'Stripe-Account': input.connectedAccountId }
        : {},
    );
  }

  async retrieveDispute(disputeId: string) {
    return this.request<StripeDispute>(
      `/v1/disputes/${encodeURIComponent(disputeId)}`,
      { method: 'GET' },
    );
  }

  async createTransferReversal(input: {
    transferId: string;
    amountCents: number;
    idempotencyKey: string;
  }) {
    const form = new URLSearchParams();
    appendFormValue(form, 'amount', input.amountCents);
    return this.postForm<StripeTransferReversal>(
      `/v1/transfers/${encodeURIComponent(input.transferId)}/reversals`,
      form,
      input.idempotencyKey,
    );
  }
}
