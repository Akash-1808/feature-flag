import { environmentRepository, Environment } from "../repositories/environment.repository";
import { NotFoundError, ConflictError, ValidationError } from "../utils/errors";

function slugify(text: string): string {
    return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const environmentService = {
    async listByOrgId(orgId: string): Promise<Environment[]> {
        return environmentRepository.findByOrgId(orgId);
    },

    async getByIdAndOrgId(id: string, orgId: string): Promise<Environment> {
        const env = await environmentRepository.findById(id);

        if (!env || env.org_id !== orgId) {
            throw new NotFoundError('Environment not Found');
        }
        return env;
    },

    async create(orgId: string, name: string, keyInput?: string): Promise<Environment> {
        if (!name || !name.trim()) {
            throw new ValidationError('Environment name is required');
        }

        const key = keyInput && keyInput.trim() ? slugify(keyInput) : slugify(name);

        if (!key) {
            throw new ValidationError('Environment Key is invalid');
        }

        try {
            return await environmentRepository.create(orgId, name.trim(), key);
        } catch (error: any) {
            if (error.code === '23505') {
                throw new ConflictError(`Environment with key "${key}" already exists in this organization`);
            }
            throw error;
        }
    },

    async delete(id: string, orgId: string): Promise<Environment> {
        const env = await this.getByIdAndOrgId(id, orgId);
        const deleted = await environmentRepository.delete(env.id);
        if (!deleted) {
            throw new NotFoundError('Environment not found');
        }
        return deleted;
    }
}
