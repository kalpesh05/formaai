import { Router, Request, Response, NextFunction } from 'express';
import { PLANS } from '../config/plans';
import { getGlobalModuleLifecycle } from '../utils/planLimits';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * GET /api/v1/plans
 * Returns live plan tiers, pricing (monthly & annual discount), quotas,
 * and current global module lifecycle states (Internal, Beta, Live).
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const modules = await getGlobalModuleLifecycle();
  return res.json({
    plans: Object.values(PLANS),
    modules,
  });
}));

export default router;
