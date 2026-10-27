// PayPal Orders v2 (sandbox). Server-side only.
const BASE = process.env.PAYPAL_BASE || 'https://api-m.sandbox.paypal.com';

export class PayPalError extends Error {
  constructor(message: string, public status: number, public issue?: string) {
    super(message);
  }
}

export type PayPalCapture = {
  id: string;
  status: string;
  amount: { value: string; currency_code: string };
};
export type PayPalOrder = {
  id: string;
  status: string;
  payer?: { name?: { given_name?: string } };
  purchase_units?: { custom_id?: string; payments?: { captures?: PayPalCapture[] } }[];
};

async function token(): Promise<string> {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new PayPalError('PayPal login failed. Check the sandbox keys.', r.status);
  return ((await r.json()) as { access_token: string }).access_token;
}

async function call(path: string, init: RequestInit & { requestId?: string }): Promise<PayPalOrder> {
  const { requestId, ...rest } = init;
  const r = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      // PayPal remembers this id, so a retried request returns the same result instead of repeating.
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      message?: string;
      details?: { issue?: string }[];
    };
    throw new PayPalError(body.message || `PayPal error ${r.status}`, r.status, body.details?.[0]?.issue);
  }
  return (await r.json()) as PayPalOrder;
}

export const createOrder = (needId: string, amount: number, currency: string) =>
  call('/v2/checkout/orders', {
    method: 'POST',
    requestId: crypto.randomUUID(),
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: needId, // read back at capture time, so the browser never says which need was paid
          description: `ReliefLoop need ${needId}`,
          amount: { currency_code: currency, value: amount.toFixed(2) },
        },
      ],
    }),
  });

export const captureOrder = (orderId: string) =>
  call(`/v2/checkout/orders/${orderId}/capture`, { method: 'POST', requestId: `capture-${orderId}` });

export const getOrder = (orderId: string) => call(`/v2/checkout/orders/${orderId}`, { method: 'GET' });
