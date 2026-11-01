import dotenv from 'dotenv';
import { z } from 'zod';

// Local development may keep a separate .env.local so a checked-out .env
// containing a remote provider URL is never selected accidentally. Explicit
// process environment variables still take precedence in CI and deployment.
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  DATABASE_URL: z.string().url().default('postgresql://catalogue:catalogue_local_only@localhost:5432/catalogue'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  RESERVATION_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  RESERVATION_EXPIRY_INTERVAL_MS: z.coerce.number().int().min(5000).max(300000).default(30000),
  ETA_AVERAGE_SPEED_KMH: z.coerce.number().positive().max(100).default(20),
  ETA_DISPATCH_BUFFER_MINUTES: z.coerce.number().min(0).max(120).default(5),
  ETA_UNCERTAINTY_BUFFER_MINUTES: z.coerce.number().min(0).max(120).default(5),
  ETA_VALIDITY_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
  ROUTES_PROVIDER: z.enum(['none', 'google']).default('none'),
  // `.env` commonly contains GOOGLE_MAPS_API_KEY= as a documented optional
  // setting. Treat that as absent so local development can use the free
  // Haversine fallback when ROUTES_PROVIDER=none.
  GOOGLE_MAPS_API_KEY: z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? undefined : value, z.string().min(1).optional()),
  ROUTES_TIMEOUT_MS: z.coerce.number().int().min(500).max(15000).default(3500),
  DELIVERY_LOCATION_MAX_CLOCK_SKEW_SECONDS: z.coerce.number().int().min(0).max(900).default(120),
  DELIVERY_LOCATION_MIN_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(300).default(5),
  DELIVERY_LOCATION_MAX_AGE_SECONDS: z.coerce.number().int().min(5).max(3600).default(120),
  DEMO_AUTO_ACCEPT_STORE_ORDERS: z.preprocess((value) => value === true || value === 'true', z.boolean()).default(false),
  DEMO_DELIVERY_SIMULATION_ENABLED: z.preprocess((value) => value === true || value === 'true', z.boolean()).default(false),
  DEMO_DELIVERY_SPEED_KMH: z.coerce.number().positive().max(100).default(20),
  DEMO_DELIVERY_TICK_INTERVAL_MS: z.coerce.number().int().min(1000).max(300000).default(5000),
  DEMO_DELIVERY_PREPARATION_DURATION_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
});

export const env = schema.parse(process.env);
