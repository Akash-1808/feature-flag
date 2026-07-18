import { NextFunction, Request, Response, Router } from "express";
import { requireActiveOrg, requireSession } from "../middleware/session.middleware";
import { staleFlagDetector } from "../jobs/stale-flag-detector";
import { dashboardRateLimiter } from "../middleware/rate-limiter.middleware.js";

const staleRouter = Router();

staleRouter.use(dashboardRateLimiter, requireSession, requireActiveOrg)

staleRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orgId = req.orgId!
        const thresholdDays = req.query.thresholdDays ? parseInt(req.query.thresholdDays as string, 10) : 30;
        const staleFlags = await staleFlagDetector.detectStaleFlags(orgId, thresholdDays);
        res.status(200).json(staleFlags);
    } catch (error) {
        next(error);
    }
})

export default staleRouter;