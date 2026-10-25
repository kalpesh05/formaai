import https from 'https';

export interface PlanSyncInput {
  id: string;
  name: string;
  tagline?: string;
  monthly_price: number;
  yearly_monthly_price: number;
  currency: string;
  payment_provider: 'stripe' | 'razorpay' | 'both' | 'manual';
  stripe_product_id?: string;
  stripe_price_monthly_id?: string;
  stripe_price_yearly_id?: string;
  razorpay_plan_monthly_id?: string;
  razorpay_plan_yearly_id?: string;
}

export interface PlanSyncResult {
  payment_provider: string;
  stripe_product_id?: string;
  stripe_price_monthly_id?: string;
  stripe_price_yearly_id?: string;
  razorpay_plan_monthly_id?: string;
  razorpay_plan_yearly_id?: string;
  sync_logs: string[];
}

/**
 * Helper to execute standard HTTPS JSON/Form requests to payment gateway REST APIs
 */
function requestHttps(options: https.RequestOptions, body?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = responseBody ? JSON.parse(responseBody) : {};
          resolve({ status: res.statusCode || 500, data: parsed });
        } catch {
          resolve({ status: res.statusCode || 500, data: responseBody });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Creates/Syncs Products and Prices in Stripe via direct REST API
 */
async function syncWithStripe(input: PlanSyncInput, logs: string[]) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const isMock = !stripeSecretKey;

  if (isMock) {
    logs.push('[STRIPE-SANDBOX] No STRIPE_SECRET_KEY set in .env; generated realistic mock gateway IDs.');
    return {
      stripe_product_id: input.stripe_product_id || `prod_mock_${input.id}_${Date.now().toString(36)}`,
      stripe_price_monthly_id: `price_mock_${input.id}_mo_${Math.round(input.monthly_price * 100)}`,
      stripe_price_yearly_id: `price_mock_${input.id}_yr_${Math.round(input.yearly_monthly_price * 12 * 100)}`,
    };
  }

  let productId = input.stripe_product_id;

  // 1. Create or verify product in Stripe
  if (!productId) {
    const productParams = new URLSearchParams({
      name: `KromaDesk - ${input.name}`,
      description: input.tagline || 'AI Assistant & Automation Plan',
      'metadata[plan_id]': input.id,
    }).toString();

    const prodRes = await requestHttps(
      {
        hostname: 'api.stripe.com',
        path: '/v1/products',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
      productParams
    );

    if (prodRes.status >= 200 && prodRes.status < 300) {
      productId = prodRes.data.id;
      logs.push(`[STRIPE] Successfully created Product: ${productId}`);
    } else {
      throw new Error(`Failed to create Stripe product: ${JSON.stringify(prodRes.data)}`);
    }
  }

  // 2. Create Monthly Price
  const monthlyAmount = Math.round(Number(input.monthly_price) * 100);
  const monthlyParams = new URLSearchParams({
    product: productId!,
    unit_amount: String(monthlyAmount),
    currency: (input.currency || 'usd').toLowerCase(),
    'recurring[interval]': 'month',
    'metadata[plan_id]': input.id,
    'metadata[interval]': 'monthly',
  }).toString();

  const monthlyRes = await requestHttps(
    {
      hostname: 'api.stripe.com',
      path: '/v1/prices',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
    monthlyParams
  );

  let monthlyPriceId = input.stripe_price_monthly_id;
  if (monthlyRes.status >= 200 && monthlyRes.status < 300) {
    monthlyPriceId = monthlyRes.data.id;
    logs.push(`[STRIPE] Successfully created Monthly Price: ${monthlyPriceId}`);
  } else {
    logs.push(`[STRIPE WARNING] Could not create monthly price: ${JSON.stringify(monthlyRes.data)}`);
  }

  // 3. Create Yearly Price
  const yearlyAmount = Math.round(Number(input.yearly_monthly_price) * 12 * 100);
  const yearlyParams = new URLSearchParams({
    product: productId!,
    unit_amount: String(yearlyAmount),
    currency: (input.currency || 'usd').toLowerCase(),
    'recurring[interval]': 'year',
    'metadata[plan_id]': input.id,
    'metadata[interval]': 'yearly',
  }).toString();

  const yearlyRes = await requestHttps(
    {
      hostname: 'api.stripe.com',
      path: '/v1/prices',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
    yearlyParams
  );

  let yearlyPriceId = input.stripe_price_yearly_id;
  if (yearlyRes.status >= 200 && yearlyRes.status < 300) {
    yearlyPriceId = yearlyRes.data.id;
    logs.push(`[STRIPE] Successfully created Yearly Price: ${yearlyPriceId}`);
  } else {
    logs.push(`[STRIPE WARNING] Could not create yearly price: ${JSON.stringify(yearlyRes.data)}`);
  }

  return {
    stripe_product_id: productId,
    stripe_price_monthly_id: monthlyPriceId,
    stripe_price_yearly_id: yearlyPriceId,
  };
}

/**
 * Creates/Syncs Plans in Razorpay via direct REST API
 */
async function syncWithRazorpay(input: PlanSyncInput, logs: string[]) {
  const rzpKey = process.env.RAZORPAY_KEY_ID;
  const rzpSecret = process.env.RAZORPAY_KEY_SECRET;
  const isMock = !rzpKey || !rzpSecret;

  if (isMock) {
    logs.push('[RAZORPAY-SANDBOX] No RAZORPAY credentials set in .env; generated realistic mock gateway IDs.');
    return {
      razorpay_plan_monthly_id: `plan_rzp_mock_${input.id}_mo_${Math.round(input.monthly_price * 100)}`,
      razorpay_plan_yearly_id: `plan_rzp_mock_${input.id}_yr_${Math.round(input.yearly_monthly_price * 12 * 100)}`,
    };
  }

  const authHeader = 'Basic ' + Buffer.from(`${rzpKey}:${rzpSecret}`).toString('base64');
  const currency = (input.currency || 'INR').toUpperCase();

  // 1. Create Monthly Plan
  const monthlyBody = JSON.stringify({
    period: 'monthly',
    interval: 1,
    item: {
      name: `KromaDesk - ${input.name} (Monthly)`,
      amount: Math.round(Number(input.monthly_price) * 100),
      currency: currency,
      description: input.tagline || 'AI Assistant Monthly Plan',
    },
    notes: {
      plan_id: input.id,
      interval: 'monthly',
    },
  });

  const monthlyRes = await requestHttps(
    {
      hostname: 'api.razorpay.com',
      path: '/v1/plans',
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    },
    monthlyBody
  );

  let monthlyPlanId: string | undefined;
  if (monthlyRes.status >= 200 && monthlyRes.status < 300) {
    monthlyPlanId = monthlyRes.data.id;
    logs.push(`[RAZORPAY] Successfully created Monthly Plan: ${monthlyPlanId}`);
  } else {
    logs.push(`[RAZORPAY WARNING] Could not create monthly plan: ${JSON.stringify(monthlyRes.data)}`);
  }

  // 2. Create Yearly Plan
  const yearlyBody = JSON.stringify({
    period: 'yearly',
    interval: 1,
    item: {
      name: `KromaDesk - ${input.name} (Annual)`,
      amount: Math.round(Number(input.yearly_monthly_price) * 12 * 100),
      currency: currency,
      description: input.tagline || 'AI Assistant Annual Plan',
    },
    notes: {
      plan_id: input.id,
      interval: 'yearly',
    },
  });

  const yearlyRes = await requestHttps(
    {
      hostname: 'api.razorpay.com',
      path: '/v1/plans',
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    },
    yearlyBody
  );

  let yearlyPlanId: string | undefined;
  if (yearlyRes.status >= 200 && yearlyRes.status < 300) {
    yearlyPlanId = yearlyRes.data.id;
    logs.push(`[RAZORPAY] Successfully created Yearly Plan: ${yearlyPlanId}`);
  } else {
    logs.push(`[RAZORPAY WARNING] Could not create yearly plan: ${JSON.stringify(yearlyRes.data)}`);
  }

  return {
    razorpay_plan_monthly_id: monthlyPlanId,
    razorpay_plan_yearly_id: yearlyPlanId,
  };
}

/**
 * Universal Plan Gateway Synchronizer
 * Connects to Stripe and/or Razorpay according to configuration.
 */
export async function syncPlanWithGateways(input: PlanSyncInput): Promise<PlanSyncResult> {
  const logs: string[] = [];
  let stripeResult: { stripe_product_id?: string; stripe_price_monthly_id?: string; stripe_price_yearly_id?: string } = {};
  let rzpResult: { razorpay_plan_monthly_id?: string; razorpay_plan_yearly_id?: string } = {};

  const provider = input.payment_provider || 'stripe';

  if (provider === 'stripe' || provider === 'both') {
    stripeResult = await syncWithStripe(input, logs);
  }

  if (provider === 'razorpay' || provider === 'both') {
    rzpResult = await syncWithRazorpay(input, logs);
  }

  return {
    payment_provider: provider,
    ...stripeResult,
    ...rzpResult,
    sync_logs: logs,
  };
}
