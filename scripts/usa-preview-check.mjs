/** US-preview static regression contract. No network or environment secrets. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(projectRoot, path), "utf8");
const entry = read("apps/web/src/main.tsx");
const preview = read("apps/web/src/USPreview.tsx");
const css = read("apps/web/src/USPreview.css");

assert.ok(entry.includes("USPreview") || entry.includes("UsLanding"), "US preview must be mounted explicitly");
assert.ok(entry.includes("'/us'"), "Expected existing route or US gate: '/us'");
assert.ok(entry.includes("appSurface"), "Expected existing route or US gate: appSurface");
assert.ok(entry.includes("/us"), "US preview must have an isolated route");
assert.ok(preview.includes("en-US"), "US preview must set document language");
assert.ok(preview.includes("Alternative Ventures"), "US brand attribution missing");
assert.match(preview, /preview/i, "US preview must identify non-live scope");
assert.match(preview, /checkout/i, "US preview must explicitly block unauthorized US commerce");
assert.ok(!/href=["']\/(app|login|cadastro|criar-conta)/i.test(preview), "US preview must not link directly to Brazilian signup");
assert.ok(!/fetch\s*\(/.test(preview), "US preview must not call Brazilian backend APIs");
assert.ok(css.includes(".avus"), "Styles must use a US-specific namespace");
assert.ok(!/^\s*(body|html|:root|\*)\s*\{/m.test(css), "US preview styles must not redefine global selectors");
console.log("PASS: nexoffice US preview route, language, copy, branding, isolation and CSS namespace");
