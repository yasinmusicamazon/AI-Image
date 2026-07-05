// Waits for the Electron main process entry point to exist (tsc watch
// output), then launches Electron. This lets `npm run dev` start the
// TypeScript watcher and Electron together without a race condition.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const mainPath = path.join(__dirname, "..", "dist-electron", "main.js");

function launch() {
  const electronBin = require("electron");
  const child = spawn(electronBin, [path.join(__dirname, "..")], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" }
  });
  child.on("close", (code) => process.exit(code ?? 0));
}

function waitForFile() {
  if (fs.existsSync(mainPath)) {
    launch();
    return;
  }
  setTimeout(waitForFile, 300);
}

waitForFile();
