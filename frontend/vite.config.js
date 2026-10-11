import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Serves the Vercel functions in /api during `vite dev`, so no separate backend is needed. */
function vercelApi() {
  return {
    name: "vercel-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res, next) => {
        const name = new URL(req.url, "http://localhost").pathname.replace(/^\/+|\/+$/g, "");
        if (!/^[a-z]+$/.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`);
          await mod.default(req, res);
        } catch (err) {
          if (err?.code === "ERR_LOAD_URL" || /Failed to load url/.test(err?.message)) return next();
          next(err);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // expose non-VITE_ vars (GROQ_API_KEY) from .env.local to the dev API only — never to the bundle
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return { plugins: [react(), tailwindcss(), vercelApi()] };
});
