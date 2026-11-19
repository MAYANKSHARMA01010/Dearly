import { defineConfig } from "@neon/config/v1";

// Deploy only the mail function. Existing database/storage settings stay outside
// this policy; inspect `neon config plan` before applying it to a live branch.
export default defineConfig({
  functions: {
    dearlymail: {
      name: "Dearly Gmail relay",
      source: "./.runtime/neon-mail/function/index.mjs",
      bundler: "none",
      env: Object.fromEntries(
        [
          "SMTP_USER",
          "SMTP_FROM",
          "SMTP_PASSWORD",
          "EMAIL_RELAY_SECRET",
          "EXTERNAL_ACCESS_SECRET",
          "CONTENT_PUBLIC_URL",
        ].map((key) => [key, { value: process.env[key], required: true }]),
      ),
    },
  },
  branch: () => ({}),
});
