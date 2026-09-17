// @lovable.dev/vite-tanstack-config already includes TanStack devtools, tanstackStart,
// viteReact, tailwindcss, tsConfigPaths, nitro, VITE_* env injection and the @ alias.
// Do NOT re-add those here or the app breaks with duplicate plugins.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Route Start's bundled server entry through src/server.ts, which applies
    // the security headers and the SSR error page.
    server: { entry: "server" },
  },
  nitro: {
    // Vercel is the deployment target. Pinning it means a local `npm run build`
    // produces the same output as CI rather than whatever Nitro auto-detects.
    preset: process.env["NITRO_PRESET"] ?? "vercel",
  },
});
