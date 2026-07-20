import { NextFunction, Request, Response, Router } from "express";
import { requireApiKey, requireApiKeyType } from "../middleware/api-key.middleware.js";
import { flagService } from "../services/flag.service.js";
import crypto from 'crypto';
import { isUserInRollout, evaluateRules } from "@feature-flag/sdk";
import { NotFoundError } from "../utils/errors";
import { validate } from "../middleware/validate.middleware.js";
import { evaluateFlagSchema } from "../validators/schemas.js";
import { gracefulDegradationMiddleware } from "../middleware/graceful-degradation.middleware.js";
import { sdkRateLimiter } from "../middleware/rate-limiter.middleware.js";
import { metricsWatcher } from "../jobs/metrics-watcher.js";
import { flagEvaluationTotal, sdkPollTotal } from "../metrics/prometheus.js";

const sdkRouter = Router();

sdkRouter.use(requireApiKey, sdkRateLimiter, gracefulDegradationMiddleware);

sdkRouter.get('/flags', requireApiKeyType('client', 'server'), async (req: Request, res: Response, next: NextFunction) => {
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
            sdkPollTotal.inc({
                environment_id: envId,
                status: '304'
            })
            res.status(304).end();
            return;
        }
        sdkPollTotal.inc({
            environment_id: envId,
            status: '200'
        });

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

sdkRouter.post('/evaluate', requireApiKeyType('server'), validate(evaluateFlagSchema), async (req: Request, res: Response, next: NextFunction) => {
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
            flagEvaluationTotal.inc({ flag_key: flagKey, environment_id: envId, outcome: 'success' });
            res.status(200).json({
                data: { enabled: false }
            })
            return;
        }

        // 2. Evaluate targeting rules in priority order (first match wins)
        if (flag.rules.length > 0 && Object.keys(attributes).length > 0) {
            const ruleValue = evaluateRules(flag.rules, attributes);
            if (ruleValue !== undefined) {
                flagEvaluationTotal.inc({ flag_key: flagKey, environment_id: envId, outcome: 'success' });
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
        flagEvaluationTotal.inc({ flag_key: flagKey, environment_id: envId, outcome: 'success' });
        res.status(200).json({
            data: {
                enabled,
                reason: enabled ? 'rollout' : 'rollout_excluded'
            }
        });

    } catch (error) {
        if (req.body?.flagKey && req.environmentId) {
            flagEvaluationTotal.inc({
                flag_key: req.body.flagKey,
                environment_id: req.environmentId,
                outcome: 'error'
            });
        }
        next(error)
    }

})

sdkRouter.post('/metrics', async (req: Request, res: Response, next: NextFunction) => {
    const { flagKey, isError } = req.body;
    await metricsWatcher.recordMetric(req.environmentId!, flagKey, Boolean(isError));
    flagEvaluationTotal.inc({
        flag_key: flagKey,
        environment_id: req.environmentId!,
        outcome: isError ? 'error' : 'success'
    })
    res.status(202).send();
});

export default sdkRouter;