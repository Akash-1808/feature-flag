import { CryptoUtils } from "../utils/crypto.utils.js";
import { apiKeyRepository, type ApiKey, type ApiKeyType } from "../repositories/api-key.repository.js";
import { auditService } from "./audit.service.js";
import { NotFoundError } from "../utils/errors.js";
import { environmentService } from "./environment.service.js";

export const apiKeyService = {
    async generate(envId: string, type: ApiKeyType, name: string, orgId: string, actorId?: string): Promise<{ apiKey: string, apiKeyData: ApiKey }> {
        const secret = CryptoUtils.randomSecret(32);
        const { apiKey, keyPrefix } = CryptoUtils.buildApiKey(type, secret);
        const keyHash = CryptoUtils.hashApiKey(apiKey);

        const apiKeyData = await apiKeyRepository.create(envId, type, name, keyHash, keyPrefix);
        // Log audit event if orgId was provided
        if (orgId) {
            await auditService.log(
                orgId,
                actorId || null,
                'CREATE API KEY',
                'api_key',
                apiKeyData.id,
                null,
                { id: apiKeyData.id, name, type, key_prefix: keyPrefix }
            );
        }
        return { apiKey, apiKeyData };
    },

    async listByEnvId(envId: string): Promise<ApiKey[]> {
        return await apiKeyRepository.findByEnvId(envId)
    },

    async revoke(id: string, orgId: string, actorId?: string | null): Promise<ApiKey> {
        const apiKey = await apiKeyRepository.findById(id);
        if (!apiKey) {
            throw new NotFoundError('API key not found or not authorized');
        }
        await environmentService.getByIdAndOrgId(apiKey.environment_id, orgId);
        const revokedKey = await apiKeyRepository.revoke(id);
        if (!revokedKey) {
            throw new NotFoundError('API key not found or already revoked');
        }
        await auditService.log(
            orgId,
            actorId || null,
            'REVOKE API KEY',
            'api_key',
            revokedKey.id,
            null,
            { id: revokedKey.id, name: revokedKey.name, revoked_at: revokedKey.revoked_at }
        );
        return revokedKey;
    },

    async validate(token: string): Promise<ApiKey | null> {
        const hash = CryptoUtils.hashApiKey(token);
        const apiKey = await apiKeyRepository.findByHash(hash);
        if (!apiKey) return null;
        if (apiKey.revoked_at) return null;
        await apiKeyRepository.updateLastUsed(apiKey.id);
        return apiKey;
    }
};