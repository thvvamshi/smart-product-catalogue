import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  DATABASE_URL: z.string().url().default('postgresql://catalogue:catalogue_local_only@localhost:5432/catalogue'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
});

export const env = schema.parse(process.env);
