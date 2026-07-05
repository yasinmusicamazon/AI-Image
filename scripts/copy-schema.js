// Copies electron/db/schema.sql into dist-electron/db/schema.sql after
// TypeScript compilation, since tsc only emits .ts -> .js and ignores
// non-TS assets. electron-builder's `extraResources` handles the packaged
// (production) case separately — see package.json "build.extraResources".
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "electron", "db", "schema.sql");
const destDir = path.join(__dirname, "..", "dist-electron", "db");
const dest = path.join(destDir, "schema.sql");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied schema.sql -> ${dest}`);
