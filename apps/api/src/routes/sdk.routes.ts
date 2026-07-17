import { NextFunction, Request, Response, Router } from "express";
import { requireApiKey } from "../middleware/api-key.middleware.js";
import { flagService } from "../services/flag.service.js";
import crypto from 'crypto';
import { isUserInRollout, evaluateRules } from "@feature-flag/sdk";
import { NotFoundError } from "../utils/errors";
import { validate } from "../middleware/validate.middleware.js";
import { evaluateFlagSchema } from "../validators/schemas.js";

const sdkRouter = Router();

sdkRouter.get('/flags', requireApiKey, async (req: Request, res: Response, next: NextFunction) => {
    const envId = req.environmentId;
    if (!envId) {
        throw new Error('Environment ID is required');
    }

    try {
        const ruleset = await flagService.getRulesetForEnvironment(envId);


        const contentHash = crypto
            .createHash('md5')
            .update(JSON.stringify(ruleset.flags))
            .digest('hex');

        const etag = `W/"${contentHash}"`

        if (req.headers['if-none-match'] === etag) {
            res.status(304).end();
            return;
        }

        res.setHeader('ETag', etag);

        res.status(200).json({
            success: true,
            data: ruleset
        })
    } catch (error) {
        next(error);
        return;
    }
})

sdkRouter.post('/evaluate', requireApiKey, validate(evaluateFlagSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const envId = req.environmentId!;
        const { flagKey, userId, attributes = {} } = req.body;

        const ruleset = await flagService.getRulesetForEnvironment(envId);

        const flag = ruleset.flags.find(f => f.key === flagKey)

        if (!flag) {
            throw new NotFoundError(`Flag with key ${flagKey} not found`)
        }

        // 1. Flag disabled — short circuit
        if (!flag.enabled) {
            res.status(200).json({
                data: { enabled: false }
            })
            return;
        }

        // 2. Evaluate targeting rules in priority order (first match wins)
        if (flag.rules.length > 0 && Object.keys(attributes).length > 0) {
            const ruleValue = evaluateRules(flag.rules, attributes);
            if (ruleValue !== undefined) {
                res.status(200).json({
                    data: {
                        enabled: true,
                        value: ruleValue,
                        reason: 'targeting_rule'
                    }
                });
                return;
            }
        }

        // 3. No targeting rule matched — fall through to rollout bucketing
        const enabled = isUserInRollout(flagKey, userId, flag.rolloutPercentage);
        res.status(200).json({
            data: {
                enabled,
                reason: enabled ? 'rollout' : 'rollout_excluded'
            }
        });

    } catch (error) {
        next(error)
    }

})

export default sdkRouter;