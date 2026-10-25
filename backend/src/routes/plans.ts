import { Router, Request, Response, NextFunction } from 'express';
import { PLANS } from '../config/plans';
import { getGlobalModuleLifecycle } from '../utils/planLimits';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

import pool from '../config/db';

/**
 * GET /api/v1/plans
 * Returns live plan tiers from the database (or default config),
 * complete with Stripe/Razorpay price IDs, quotas, and global module lifecycle states.
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const modules = await getGlobalModuleLifecycle();

  let plans: any[] = [];
  try {
    const plansRes = await pool.query(
      `SELECT id, name, tagline, monthly_price as "monthlyPrice",
              yearly_monthly_price as "yearlyMonthlyPrice", currency,
              max_agents as "maxAgents", monthly_message_limit as "monthlyMessageLimit",
              max_forms as "maxForms", max_ingest_urls as "maxIngestUrls",
              white_label as "whiteLabel", custom_colors as "customColors",
              rank, highlight, payment_provider as "paymentProvider",
              stripe_product_id as "stripeProductId",
              stripe_price_monthly_id as "stripePriceMonthlyId",
              stripe_price_yearly_id as "stripePriceYearlyId",
              razorpay_plan_monthly_id as "razorpayPlanMonthlyId",
              razorpay_plan_yearly_id as "razorpayPlanYearlyId"
       FROM subscription_plans
       WHERE is_active = true AND is_public = true
       ORDER BY rank ASC`
    );

    if (plansRes.rows.length > 0) {
      plans = plansRes.rows.map((row) => ({
        ...row,
        monthlyPrice: Number(row.monthlyPrice),
        yearlyMonthlyPrice: Number(row.yearlyMonthlyPrice),
      }));
    }
  } catch (err) {
    console.warn('[PLANS_ROUTE] Could not load from DB, falling back to static config:', err);
  }

  if (plans.length === 0) {
    plans = Object.values(PLANS);
  }

  return res.json({
    plans,
    modules,
  });
}));

export default router;
