import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed values, and only to import.meta.env. The
  // server reads Knock's keys from process.env, so copy them across from .env
  // without overriding anything the shell already set.
  for (const [key, value] of Object.entries(
    loadEnv(mode, process.cwd(), "KNOCK_")
  )) {
    process.env[key] ??= value;
  }

  return {
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  };
});
