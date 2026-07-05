import { app, BrowserWindow, shell, Menu, dialog } from "electron";
import path from "path";
import { registerIpcHandlers } from "./ipc/handlers";
import {
  registerContentAndPlannerHandlers,
  registerImageHandlers,
  registerBackupHandlers,
  registerJobHandlers,
  registerTemplateHandlers,
  registerGlobalSettingsHandlers
} from "./ipc/extra-handlers";
import { closeDb } from "./db/database";

const isDev = process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;

// Surface any crash in the main process as a visible dialog instead of a
// silent hang or disappearing window. This is deliberately verbose —
// during early development it's far more useful to see the raw error
// than to guess why a screen never loaded.
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception in main process:", error);
  dialog.showErrorBox(
    "WP AI Image Publisher — Unexpected Error",
    `${error.message}\n\n${error.stack ?? ""}`
  );
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection in main process:", reason);
});

function buildApplicationMenu(): void {
  // A minimal custom menu that always includes a DevTools toggle,
  // regardless of dev/production, so issues can be diagnosed from a
  // packaged build without rebuilding from source.
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [{ role: "quit" }]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools", accelerator: "CmdOrCtrl+Shift+I" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Open Logs Folder",
          click: () => {
            shell.openPath(app.getPath("userData"));
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0f1115",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Open external links (e.g. WordPress site URLs) in the OS browser
  // instead of navigating the app window away from the UI.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // If the renderer process itself crashes (not just an in-app error),
  // tell the user instead of leaving a dead/blank window.
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    dialog.showErrorBox(
      "WP AI Image Publisher — Renderer Crashed",
      `The app's display process stopped unexpectedly (reason: ${details.reason}). Please reopen the app. If this keeps happening, open Help > Open Logs Folder and check for details.`
    );
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  buildApplicationMenu();

  try {
    registerIpcHandlers();
    registerContentAndPlannerHandlers();
    registerImageHandlers();
    registerBackupHandlers();
    registerTemplateHandlers();
    registerGlobalSettingsHandlers();
  } catch (error) {
    console.error("Failed to register IPC handlers:", error);
    dialog.showErrorBox(
      "WP AI Image Publisher — Startup Error",
      `The app failed to initialize its backend services.\n\n${(error as Error).message}`
    );
  }

  createMainWindow();
  registerJobHandlers(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  closeDb();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

