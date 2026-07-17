import { Request, Router, Response, NextFunction } from "express";
import { requireActiveOrg, requireOrgRole, requireSession } from "../middleware/session.middleware";
import { environmentService } from "../services/environment.service";
import { validate } from "../middleware/validate.middleware.js";
import { createEnvironmentSchema } from "../validators/schemas.js";

const environmentRouter = Router();

environmentRouter.use(requireSession, requireActiveOrg)


environmentRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orgId = req.orgId!;
        const environments = await environmentService.listByOrgId(orgId);
        res.status(200).json({
            environments
        });
    } catch (error) {
        next(error);
    }
})

environmentRouter.post('/', requireOrgRole('admin', 'owner'), validate(createEnvironmentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orgId = req.orgId!;
        const { name, key } = req.body;
        const environment = await environmentService.create(orgId, name, key);
        res.status(201).json({
            environment
        });
    } catch (error) {
        next(error);
    }
})

environmentRouter.delete('/:id', requireOrgRole('owner'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const environment = await environmentService.delete(id!, req.orgId!);
        res.status(200).json({
            message: "Environment deleted successfully", environment: environment
        })

    } catch (error) {
        next(error);
    }
})

export default environmentRouter;
