import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Lets `next dev` see the same Cloudflare bindings (env vars, etc.) that
// production Workers will have, so local dev behaves consistently with
// what actually runs on Cloudflare.
initOpenNextCloudflareForDev();

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
