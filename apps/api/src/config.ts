import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/feature_flags'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PORT: z.coerce.number().default(3001),
  BETTER_AUTH_SECRET: z.string().default('dev_default_secret_key_change_in_production'),
  BETTER_AUTH_URL: z.string().default('http://localhost:3001'),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  API_RATE_LIMIT_MAX: z.coerce.number().default(100),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsedConfig = configSchema.safeParse(process.env);

if (!parsedConfig.success) {
  console.error('❌ Invalid environment variables:', parsedConfig.error.format());
  process.exit(1);
}

export const config = parsedConfig.data;
export type Config = z.infer<typeof configSchema>;
