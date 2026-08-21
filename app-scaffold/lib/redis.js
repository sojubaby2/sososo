import { Redis } from "@upstash/redis";

// The Vercel Marketplace → Upstash integration has used a couple of
// different env var naming conventions over time (KV_REST_API_* from the
// old "Vercel KV" branding, UPSTASH_REDIS_REST_* from the newer direct
// Upstash integration). We check both so this works regardless of which
// one actually got created.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

let client = null;

export function getRedis() {
  if (client) return client;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
}
