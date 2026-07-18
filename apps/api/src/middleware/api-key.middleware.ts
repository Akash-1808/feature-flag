import { NextFunction, Request, Response } from "express";
import { ApiKey, apiKeyRepository, ApiKeyType } from "../repositories/api-key.repository.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";
import { CryptoUtils } from "../utils/crypto.utils.js";
declare global {
    namespace Express {
        interface Request {
            apiKey?: ApiKey;
            environmentId?: string;
        }
    }
}
export const requireApiKey = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
        let token: string | undefined;
        const authHeader = req.headers.authorization;
        const xApiKey = req.headers['x-api-key'] as string;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
        } else if (xApiKey) {
            token = xApiKey;
        }

        if (!token) throw new UnauthorizedError('Missing API key in Authorization or X-API-Key header');

        const hash = CryptoUtils.hashApiKey(token);

        const apiKeyData = await apiKeyRepository.findByHash(hash);
        if (!apiKeyData) {
            throw new UnauthorizedError('Invalid API key or revoked API Key');
        }

        // Check if query or body explicitly requests a different environment
        const requestedEnv = (req.query.environmentId || req.query.envId || req.body?.environmentId || req.body?.envId) as string | undefined;
        if (requestedEnv && requestedEnv !== apiKeyData.environment_id) {
            throw new ForbiddenError(`Forbidden: API key is scoped to environment '${apiKeyData.environment_id}' and cannot access '${requestedEnv}'`);
        }

        req.apiKey = apiKeyData;
        req.environmentId = apiKeyData.environment_id;

        apiKeyRepository.updateLastUsed(apiKeyData.id).catch((error) => {
            console.error(`Failed to update last used for API key ${apiKeyData.id}:`, error);
        });

        next()


    } catch (error) {
        next(error);
    }
}

export const requireApiKeyType = (...allowedTypes: ApiKeyType[]) => {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const apiKey = req.apiKey;
        if (!apiKey) {
            next(new UnauthorizedError(`Required API key type: ${allowedTypes.join(' or ')}`));
            return;
        }
        if (!allowedTypes.includes(apiKey.type)) {
            next(new ForbiddenError(`Forbidden: API key of type '${apiKey.type}' cannot perform this action. Required: ${allowedTypes.join(' or ')}`));
            return;
        }
        next();
    }
}