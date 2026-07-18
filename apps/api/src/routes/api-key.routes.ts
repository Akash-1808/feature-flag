import { NextFunction, Request, Response, Router } from "express";
import { requireActiveOrg, requireOrgRole, requireSession } from "../middleware/session.middleware.js";
import { apiKeyService } from "../services/api-key.service.js";
import { environmentService } from "../services/environment.service.js";
import { validate } from "../middleware/validate.middleware.js";
import { createApiKeySchema, listApiKeysQuerySchema } from "../validators/schemas.js";
import { dashboardRateLimiter } from "../middleware/rate-limiter.middleware.js";

const apiKeyRouter = Router();

apiKeyRouter.use(dashboardRateLimiter, requireSession, requireActiveOrg)

apiKeyRouter.post('/', requireOrgRole('admin', 'owner'), validate(createApiKeySchema), async (req, res, next) => {
    try {
        const { environmentId, type, name } = req.body;
        const orgId = req.orgId!;
        await environmentService.getByIdAndOrgId(environmentId, orgId);
        const { apiKeyData, apiKey } = await apiKeyService.generate(environmentId, type, name, orgId);
        res.status(201).json({ apiKeyData, apiKey });
    } catch (error) {
        next(error);
    }
})

apiKeyRouter.get('/', requireActiveOrg, validate(listApiKeysQuerySchema, 'query'), async (req, res, next) => {
    try {
        const environmentId = req.query.environmentId as string;
        const orgId = req.orgId!;
        await environmentService.getByIdAndOrgId(environmentId, orgId);
        const apiKeys = await apiKeyService.listByEnvId(environmentId);
        res.status(200).json(apiKeys);
    } catch (error) {
        next(error);
    }
})
apiKeyRouter.delete('/:id', requireOrgRole('admin', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id;
        const orgId = req.orgId;
        if (!id || !orgId) {
            throw new Error('Missing required fields');
        }
        const revokedKey = await apiKeyService.revoke(id, orgId);
        res.status(200).json(revokedKey);
    } catch (error) {
        next(error);
    }
})

export default apiKeyRouter;