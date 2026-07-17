import * as crypto from 'crypto';
import { ApiKeyType } from '../repositories/api-key.repository';

export class CryptoUtils {
    static randomSecret(bytes = 32): string {
        return crypto.randomBytes(bytes).toString('base64url');
    }
    static buildApiKey(type: ApiKeyType, secret: string): { apiKey: string, keyPrefix: string } {
        const typePrefix = type === 'client' ? 'client' : 'server';
        const keyPrefix = crypto.randomBytes(4).toString('hex');
        const apiKey = `${typePrefix}_${keyPrefix}_${secret}`;
        return { apiKey, keyPrefix }
    }
    static hashApiKey(apiKey: string): string {
        return crypto.createHash('sha256').update(apiKey).digest('hex');
    }
    static getKeyPrefix(apiKey: string): string {
        const parts = apiKey.split('_');
        return parts[1] || '';
    }
}
