import { Router, Request, Response, NextFunction } from "express";
import { requireActiveOrg } from "../middleware/session.middleware";
import { auditService } from "../services/audit.service";
import { validate } from "../middleware/validate.middleware.js";
import { auditLogQuerySchema } from "../validators/schemas.js";

const auditRouter = Router();

auditRouter.use(requireActiveOrg);

auditRouter.get('/', validate(auditLogQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
    const orgId = req.orgId!;
    const { limit, offset: rawOffset, page } = req.query as any;

    let offset = rawOffset ?? 0;
    if (rawOffset === undefined && page !== undefined) {
        offset = (page - 1) * limit;
    }

    try {
        const logs = await auditService.listByOrgId(orgId, limit, offset);
        res.status(200).json({
            success: true,
            data: logs,
            pagination: {
                limit,
                offset,
                page: Math.floor(offset / limit) + 1,
                hasMore: logs.length === limit
            }
        })
    } catch (error) {
        next(error);
    }
})

export default auditRouter;