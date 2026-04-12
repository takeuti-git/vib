import { defineManifest } from "@crxjs/vite-plugin";

const target = process.env.TARGET;

export default defineManifest(() => {
  const isFirefox = target === "firefox";

  return {
    manifest_version: 3,
    name: "VIB",
    version: "0.1.0",
    permissions: ["storage", "scripting", "tabs"],

    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["src/content/index.ts"],
        run_at: "document_idle"
      }
    ],

    background: isFirefox
      ? {
          scripts: ["src/content/index.ts"] // firefox用
        }
      : {
          service_worker: "src/content/index.ts",
          type: "module"
        }
  };
});
