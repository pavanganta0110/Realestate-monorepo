import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { StripeClient } from './stripe-client.service';

describe('StripeClient webhook verification', () => {
  const payload = Buffer.from(
    JSON.stringify({
      id: 'evt_123',
      type: 'checkout.session.completed',
      livemode: true,
      data: { object: { id: 'cs_123' } },
    }),
  );
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'STRIPE_RENT_PAYMENTS_ENABLED') return 'true';
      if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test_secret';
      if (key === 'STRIPE_CONNECT_WEBHOOK_SECRET') {
        return 'whsec_test_connect_secret';
      }
      return undefined;
    }),
  };

  it('accepts a current valid Stripe signature', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', 'whsec_test_secret')
      .update(`${timestamp}.${payload.toString('utf8')}`)
      .digest('hex');
    const event = new StripeClient(config as never).verifyWebhook(
      payload,
      `t=${timestamp},v1=${signature}`,
    );
    expect(event.id).toBe('evt_123');
  });

  it('rejects an invalid signature and disabled payment processing', async () => {
    expect(() =>
      new StripeClient(config as never).verifyWebhook(payload, 't=1,v1=nope'),
    ).toThrow(BadRequestException);
    await expect(
      new StripeClient({
        get: jest.fn(() => 'false'),
      } as never).createCheckoutSession({
        paymentId: 'payment-1',
        tenantEmail: 'tenant@example.com',
        propertyName: 'Property',
        amountCents: 100,
        commissionCents: 10,
        destinationAccountId: 'acct_123',
        successUrl: 'https://tenant.coachjohnsonrealty.com/tenant/pay-rent',
        cancelUrl: 'https://tenant.coachjohnsonrealty.com/tenant/pay-rent',
        idempotencyKey: 'key',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('verifies an Accounts v2 Thin event with its dedicated signing secret', () => {
    const thinPayload = Buffer.from(
      JSON.stringify({
        id: 'evt_thin_123',
        type: 'v2.core.account[configuration.recipient].capability_status_updated',
        livemode: true,
        related_object: { id: 'acct_owner_123', type: 'v2.core.account' },
      }),
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', 'whsec_test_connect_secret')
      .update(`${timestamp}.${thinPayload.toString('utf8')}`)
      .digest('hex');

    const event = new StripeClient(config as never).verifyConnectWebhook(
      thinPayload,
      `t=${timestamp},v1=${signature}`,
    );

    expect(event.related_object?.id).toBe('acct_owner_123');
  });

  it('preserves the exact Accounts v2 recipient transfer status', () => {
    const client = new StripeClient(config as never);
    const account = {
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: { stripe_transfers: { status: 'restricted' } },
          },
        },
      },
    };

    expect(client.recipientTransferStatus(account)).toBe('restricted');
    expect(client.recipientTransfersActive(account)).toBe(false);
  });

  it('uses the current Accounts v2 profile field for an owner business name', async () => {
    let requestBody: string | undefined;
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        requestBody = typeof init?.body === 'string' ? init.body : undefined;
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'acct_owner_123' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      },
    );
    const originalFetch = global.fetch;
    global.fetch = fetchMock;

    try {
      await expect(
        new StripeClient({
          get: jest.fn((key: string) => {
            if (key === 'STRIPE_RENT_PAYMENTS_ENABLED') return 'true';
            if (key === 'STRIPE_SECRET_KEY') return 'sk_test_example';
            return undefined;
          }),
        } as never).createRecipientAccount({
          ownerId: 'owner-123',
          email: 'owner@example.com',
          businessName: 'Zyene Holdings',
          idempotencyKey: 'owner-account-owner-123',
        }),
      ).resolves.toEqual({ id: 'acct_owner_123' });

      if (!requestBody) {
        throw new Error('Expected Stripe to send a JSON request body');
      }
      const payload = JSON.parse(requestBody) as {
        defaults: {
          profile?: { doing_business_as?: string };
          responsibilities: {
            fees_collector: string;
            losses_collector: string;
          };
        };
        identity?: unknown;
      };
      expect(payload.defaults).toMatchObject({
        profile: { doing_business_as: 'Zyene Holdings' },
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      });
      expect(payload.identity).toBeUndefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('creates a direct one-time application-fee Checkout without sensitive metadata', async () => {
    let requestBody = '';
    const originalFetch = global.fetch;
    global.fetch = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        requestBody = typeof init?.body === 'string' ? init.body : '';
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'cs_application_123',
              url: 'https://checkout.stripe.com/example',
              expires_at: 2_000_000_000,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      },
    );

    try {
      await new StripeClient({
        get: jest.fn((key: string) => {
          if (key === 'STRIPE_APPLICATION_FEES_ENABLED') return 'true';
          if (key === 'STRIPE_SECRET_KEY') return 'sk_test_example';
          return undefined;
        }),
      } as never).createApplicationFeeCheckoutSession({
        applicationId: 'application-123',
        applicantEmail: 'applicant@example.com',
        propertyName: 'Oakwood',
        amountCents: 5000,
        successUrl: 'https://coachjohnsonrealty.com/success',
        cancelUrl: 'https://coachjohnsonrealty.com/cancel',
        idempotencyKey: 'application-fee-123',
      });

      const form = new URLSearchParams(requestBody);
      expect(form.get('metadata[rental_application_id]')).toBe(
        'application-123',
      );
      expect(form.get('line_items[0][price_data][unit_amount]')).toBe('5000');
      expect(form.get('payment_method_types[0]')).toBeNull();
      expect(requestBody).not.toContain('dateOfBirth');
      expect(requestBody).not.toContain('monthlyGrossIncome');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('creates an itemized move-in Checkout with the owner split', async () => {
    let requestBody = '';
    const originalFetch = global.fetch;
    global.fetch = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        requestBody = typeof init?.body === 'string' ? init.body : '';
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'cs_move_in_123',
              url: 'https://checkout.stripe.com/move-in',
              expires_at: 2_000_000_000,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      },
    );
    try {
      await new StripeClient({
        get: jest.fn((key: string) => {
          if (key === 'STRIPE_RENT_PAYMENTS_ENABLED') return 'true';
          if (key === 'STRIPE_SECRET_KEY') return 'sk_test_example';
          return undefined;
        }),
      } as never).createMoveInCheckoutSession({
        paymentId: 'payment-123',
        tenantEmail: 'tenant@example.com',
        lineItems: [
          { name: 'First month rent', amountCents: 180000 },
          { name: 'Security deposit', amountCents: 120000 },
        ],
        managementAmountCents: 18000,
        destinationAccountId: 'acct_owner_123',
        successUrl: 'https://tenant.example/success',
        cancelUrl: 'https://tenant.example/cancel',
        idempotencyKey: 'move-in-payment-123',
      });

      const form = new URLSearchParams(requestBody);
      expect(form.get('metadata[move_in_payment_id]')).toBe('payment-123');
      expect(form.get('line_items[0][price_data][unit_amount]')).toBe('180000');
      expect(form.get('line_items[1][price_data][unit_amount]')).toBe('120000');
      expect(form.get('payment_intent_data[transfer_data][destination]')).toBe(
        'acct_owner_123',
      );
      expect(form.get('payment_intent_data[application_fee_amount]')).toBe(
        '18000',
      );
      expect(form.get('payment_method_types[0]')).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('reverses both the connected-account transfer and application fee on a rent refund', async () => {
    let requestBody = '';
    const originalFetch = global.fetch;
    global.fetch = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        requestBody = typeof init?.body === 'string' ? init.body : '';
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: 're_rent_refund', status: 'succeeded' }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      },
    );

    try {
      await new StripeClient({
        get: jest.fn((key: string) => {
          if (key === 'STRIPE_RENT_PAYMENTS_ENABLED') return 'true';
          if (key === 'STRIPE_SECRET_KEY') return 'sk_test_example';
          return undefined;
        }),
      } as never).createDestinationChargeRefund({
        paymentIntentId: 'pi_rent_123',
        amountCents: 120000,
        idempotencyKey: 'rent-refund-payment-123-request-123',
      });

      const form = new URLSearchParams(requestBody);
      expect(form.get('payment_intent')).toBe('pi_rent_123');
      expect(form.get('amount')).toBe('120000');
      expect(form.get('reverse_transfer')).toBe('true');
      expect(form.get('refund_application_fee')).toBe('true');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
