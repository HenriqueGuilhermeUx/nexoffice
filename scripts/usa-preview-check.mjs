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

const operational = read("apps/web/src/USWorkbench.tsx");
assert.ok(operational.includes("browser-only demonstration"), "USWorkbench.tsx expected capability missing: browser-only demonstration");
assert.ok(operational.includes("Add sample task"), "USWorkbench.tsx expected capability missing: Add sample task");
assert.ok(operational.includes("Reset board"), "USWorkbench.tsx expected capability missing: Reset board");
assert.ok(operational.includes("No accounts"), "USWorkbench.tsx expected capability missing: No accounts");
assert.ok(!/(fetch|XMLHttpRequest)\s*\(/.test(operational), "Operational US preview must not call backend APIs");
assert.ok(!/localStorage\s*\.|sessionStorage\s*\./.test(operational), "Demo should not persist potentially identifying visitor input");
assert.ok(!/href=["']\/(app|login|cadastro|criar-conta)/i.test(operational), "Demo must not send visitors to Brazilian account activation");


const crm = read("apps/web/src/USSalesPipeline.tsx");
const crmStyles = read("apps/web/src/USSalesPipeline.css");
assert.ok(preview.includes("<USSalesPipeline />"), "CRM example must be mounted in US preview only");
assert.ok(crm.includes("No customer or commercial information is saved or transmitted."), "CRM data disclaimer missing");
assert.ok(crm.includes("initial") || crm.includes("samples"), "CRM must use fictional examples only");
assert.ok(!crm.includes('fetch(') && !crm.includes('XMLHttpRequest('), 'US CRM cannot call a backend');
assert.ok(!crm.includes('localStorage.') && !crm.includes('sessionStorage.'), 'US CRM cannot store customer data');
assert.ok(crmStyles.includes(".avus .avsp"), "US CRM CSS must be namespaced");

console.log("PASS: nexoffice US preview route, language, copy, branding, isolation and CSS namespace");
