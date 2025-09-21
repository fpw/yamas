/// <reference types="vitest" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
    build: {
        outDir: "dist",
    },
    test: {
        globals: true,
        exclude: [...configDefaults.exclude, "dist/"],
        coverage: {
            provider: "v8",
        },
    },
});
