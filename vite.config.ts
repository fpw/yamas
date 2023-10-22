/// <reference types="vitest" />
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
    build: {
        outDir: "build",
    },
    test: {
        globals: true,
    },
});
