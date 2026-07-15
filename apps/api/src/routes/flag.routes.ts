import { NextFunction, Request, Response, Router } from 'express';
import { requireActiveOrg, requireOrgRole, requireSession } from '../middleware/session.middleware.js';
import { flagService } from '../services/flag.service.js';


const flagRouter = Router();

flagRouter.use(requireSession, requireActiveOrg)

flagRouter.post('/', requireOrgRole('admin', 'owner', 'member'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orgId = req.orgId!;
        const { name, key, description, type } = req.body;
        const actorId = req.session?.user?.id || null;
        const result = await flagService.create(orgId, name, key, description, type, actorId);
        res.status(201).json({
            flag: result.flag,
            states: result.states
        })
    } catch (error) {
        next(error)
    }
})

flagRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orgId = req.orgId!;
        const flags = await flagService.listByOrgId(orgId);
        res.status(200).json({
            flags
        });
    } catch (error) {
        next(error)
    }
})

flagRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const flagId = req.params.id;
        const orgId = req.orgId!;
        const result = await flagService.getByIdAndOrg(flagId, orgId)
        res.status(200).json({ result })
    } catch (error) {
        next(error)
    }
})

flagRouter.patch('/:id', requireOrgRole('admin', 'owner', 'member'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const flagId = req.params.id;
        const orgId = req.orgId!;
        const { name, description } = req.body;
        const actorId = req.session?.user?.id || null;
        const result = await flagService.update(flagId, orgId, name, description, actorId);
        res.status(200).json({ result })
    } catch (error) {
        next(error)
    }
})

flagRouter.delete('/:id', requireOrgRole('admin', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const flagId = req.params.id;
        const orgId = req.orgId!;
        const actorId = req.session?.user?.id || null;
        await flagService.delete(flagId, orgId, actorId)
        res.status(204).send()
    } catch (error) {
        next(error)
    }
})

flagRouter.patch('/:id/environments/:envId', requireOrgRole('admin', 'owner', 'member'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const flagId = req.params.id;
        const envId = req.params.envId;
        const orgId = req.orgId!;
        const actorId = req.session?.user?.id || null;
        const { enabled, rolloutPercentage } = req.body;

        const result = await flagService.updateFlagState(flagId, envId, orgId, enabled, rolloutPercentage, actorId)

        res.status(200).json({ state: result })
    } catch (error) {
        next(error)
    }
})

flagRouter.post('/:id/environments/:envId/rules', requireOrgRole('admin', 'owner', 'member'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const flagId = req.params.id;
        const envId = req.params.envId;
        const orgId = req.orgId!;
        const actorId = req.session?.user?.id || null;
        const { conditions, variation } = req.body;

        const result = await flagService.createTargetingRule(flagId, envId, orgId, conditions, variation, actorId)

        res.status(201).json({ rule: result })
    } catch (error) {
        next(error)
    }
})

flagRouter.patch('/:id/environments/:envId/rules/:ruleId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const flagId = req.params.id;
        const envId = req.params.envId;
        const ruleId = req.params.ruleId;
        const orgId = req.orgId!;
        const actorId = req.session?.user?.id || null;
        const { conditions, variation } = req.body;

        const result = await flagService.updateTargetingRule(flagId, envId, ruleId, orgId, conditions, variation, actorId)

        res.status(200).json({ rule: result })
    } catch (error) {
        next(error)
    }
})

flagRouter.delete('/:id/environments/:envId/rules/:ruleId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const flagId = req.params.id;
        const envId = req.params.envId;
        const ruleId = req.params.ruleId;
        const orgId = req.orgId!;
        const actorId = req.session?.user?.id || null;
        await flagService.deleteTargetingRule(flagId, envId, ruleId, orgId, actorId)
        res.status(204).send()
    } catch (error) {
        next(error)
    }
})

flagRouter.put('/:id/environments/:envId/rules/reorder', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const flagId = req.params.id;
        const envId = req.params.envId;
        const orgId = req.orgId!;
        const actorId = req.session?.user?.id || null;
        const { ruleIds } = req.body

        const result = await flagService.reorderingTargetingRules(flagId, envId, ruleIds, orgId, actorId)

        res.status(200).json({ rules: result })
    } catch (error) {
        next(error)
    }
})



export default flagRouter;