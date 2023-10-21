/// <reference types="vitest" />
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
    build: {
        outDir: "build",
        rollupOptions: {
            output: {
                manualChunks: {
                    "en-wiktionary-la-modules": ["@fpw/en-wiktionary-la-modules"],
                    "mui": ["@mui/material"],
                },
            },
        },
    },
    test: {
        globals: true,
    },
});
