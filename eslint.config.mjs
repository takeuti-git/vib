import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
    {
        files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
        plugins: { js },
        extends: ["js/recommended"],
        languageOptions: { globals: globals.browser },
        rules: {
            "semi": ["error", "always"],    // セミコロンの強制
            "eqeqeq": ["error", "always"],  // 等価演算子==の禁止
            "prefer-const": "error",        // 再代入のないletの禁止
        },
    },
    tseslint.configs.recommended,
]);
