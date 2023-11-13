/// <reference types="vitest" />
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
    build: {
        outDir: "dist",
    },
    test: {
        globals: true,
        coverage: {
            provider: "v8",
        },
    },
});
