/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { createLogger, defineConfig } from "vite"

// React Compiler emits a Todo diagnostic per function it cannot compile. Those
// are its own unimplemented syntax, not defects here, and they bury the build
// output. Other compiler diagnostics still surface.
const logger = createLogger()
const warn = logger.warn.bind(logger)
logger.warn = (msg, options) => {
  if (msg.includes("react-compiler(Todo)")) {
    return
  }
  warn(msg, options)
}

export default defineConfig(({ mode }) => ({
  customLogger: logger,
  build: {
    target: "es2023",
    outDir: "../cmd/maggie/web",
    emptyOutDir: true,
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: "\\.test\\.(ts|tsx)$",
    }),
    react({ compiler: mode !== "test" }),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("src", import.meta.url)) },
  },
  server: {
    port: 3001,
    proxy: { "/api": "http://localhost:8088" },
  },
  // Only the pure logic in src/lib is under test, so the suite needs no DOM.
  // Components and routes are covered by the build and by oxlint.
  test: {
    globals: true,
    clearMocks: true,
    coverage: {
      include: ["src/lib/**/*.ts"],
      // actor.ts is a localStorage hook and utils.ts wraps clsx; both are thin
      // enough that a test would only assert the library's own behaviour.
      exclude: ["src/lib/actor.ts", "src/lib/utils.ts"],
      thresholds: { lines: 90 },
    },
  },
}))
