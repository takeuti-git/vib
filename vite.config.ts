import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
    plugins: [
        crx({ manifest })
    ],
    build: {
        outDir: "dist",
    },
    server: {
        host: "0.0.0.0",
    }
});
