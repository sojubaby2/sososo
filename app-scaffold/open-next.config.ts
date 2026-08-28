import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config — no R2/KV incremental cache wired up yet. This app doesn't
// rely on Next.js page-level ISR (every page here is a client component that
// polls its own API routes), so the default in-memory cache is enough to get
// deployed. If upstream fetch caching (the `next: { revalidate }` options in
// the API routes) turns out to matter for cost/rate-limits later, an R2
// bucket can be added here — see https://opennext.js.org/cloudflare/caching.
export default defineCloudflareConfig();
