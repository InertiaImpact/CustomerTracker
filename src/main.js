const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const BASE_DIR = app.getAppPath();
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const DATA_DIR = path.join(BASE_DIR, 'data');
const DATA_PATH = path.join(DATA_DIR, 'visits.csv');

const DEFAULT_CONFIG = {
  adult_ticket_price: 8.0,
  adult_door_price: 10.0,
  child_ticket_price: 5.0,
  child_door_price: 6.0,
  batch_idle_seconds: 5,
};

const CSV_HEADERS = [
  'timestamp',
  'adult_ticket_count',
  'adult_door_count',
  'child_ticket_count',
  'child_door_count',
  'adult_ticket_price',
  'adult_door_price',
  'child_ticket_price',
  'child_door_price',
  'total_visitors',
  'total_sales',
];

function buildHeaderLine() {
  return CSV_HEADERS.map(csvEscape).join(',');
}

function formatBackupTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function csvEscape(value) {
  const asString = String(value ?? '');
  const escaped = asString.replace(/"/g, '""');
  return `"${escaped}"`;
}

function ensureStorage() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_PATH)) {
    const headerLine = buildHeaderLine();
    fs.writeFileSync(DATA_PATH, `\uFEFF${headerLine}\r\n`, 'utf-8');
  }
}

function backupAndClearData() {
  ensureStorage();

  const timestamp = formatBackupTimestamp(new Date());
  const backupName = `visits_backup_${timestamp}.csv`;
  const backupPath = path.join(DATA_DIR, backupName);

  const activeContent = fs.existsSync(DATA_PATH)
    ? fs.readFileSync(DATA_PATH, 'utf-8')
    : `\uFEFF${buildHeaderLine()}\r\n`;

  fs.writeFileSync(backupPath, activeContent, 'utf-8');
  fs.writeFileSync(DATA_PATH, `\uFEFF${buildHeaderLine()}\r\n`, 'utf-8');

  return {
    backupFileName: backupName,
    backupPath,
  };
}

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(nextConfig) {
  const idleSecondsRaw = Number(nextConfig.batch_idle_seconds);
  const idleSeconds = Number.isFinite(idleSecondsRaw) ? idleSecondsRaw : DEFAULT_CONFIG.batch_idle_seconds;
  const sanitized = {
    adult_ticket_price: Number(nextConfig.adult_ticket_price) || 0,
    adult_door_price: Number(nextConfig.adult_door_price) || 0,
    child_ticket_price: Number(nextConfig.child_ticket_price) || 0,
    child_door_price: Number(nextConfig.child_door_price) || 0,
    batch_idle_seconds: Math.max(1, Math.min(120, Math.round(idleSeconds))),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(sanitized, null, 2), 'utf-8');
  return sanitized;
}

function appendVisitRow(payload) {
  const rowValues = [
    payload.timestamp,
    payload.adult_ticket_count,
    payload.adult_door_count,
    payload.child_ticket_count,
    payload.child_door_count,
    payload.adult_ticket_price,
    payload.adult_door_price,
    payload.child_ticket_price,
    payload.child_door_price,
    payload.total_visitors,
    payload.total_sales,
  ];

  const line = `${rowValues.map(csvEscape).join(',')}\r\n`;
  fs.appendFileSync(DATA_PATH, line, 'utf-8');
}

function readVisits() {
  return readVisitsFromPath(DATA_PATH);
}

function readVisitsFromPath(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) {
    return [];
  }

  const lines = raw.split(/\r?\n/);
  if (lines.length <= 1) {
    return [];
  }

  const headers = lines[0].replace(/^\uFEFF/, '').split(',').map((h) => h.replace(/^"|"$/g, '').replace(/""/g, '"'));
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
    if (cols.length !== headers.length) {
      continue;
    }

    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx];
    });
    rows.push(row);
  }

  return rows;
}

function sanitizeDataFileName(fileName) {
  const safeName = path.basename(String(fileName || ''));
  if (!safeName || safeName.includes('..') || !safeName.toLowerCase().endsWith('.csv')) {
    throw new Error('Invalid file name');
  }
  return safeName;
}

function listDataFiles() {
  ensureStorage();
  const files = fs.readdirSync(DATA_DIR)
    .filter((name) => name.toLowerCase().endsWith('.csv') && name.toLowerCase().startsWith('visits'))
    .map((name) => {
      const fullPath = path.join(DATA_DIR, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        modifiedMs: stat.mtimeMs,
        isActive: name.toLowerCase() === 'visits.csv',
      };
    })
    .sort((a, b) => {
      if (a.isActive && !b.isActive) {
        return -1;
      }
      if (!a.isActive && b.isActive) {
        return 1;
      }
      return b.modifiedMs - a.modifiedMs;
    });

  return files;
}

function readVisitsFromFile(fileName) {
  ensureStorage();
  const safeName = sanitizeDataFileName(fileName);
  const targetPath = path.join(DATA_DIR, safeName);
  if (!fs.existsSync(targetPath)) {
    throw new Error('File not found');
  }
  return readVisitsFromPath(targetPath);
}

function copyFileToActive(fileName) {
  ensureStorage();
  const safeName = sanitizeDataFileName(fileName);
  const sourcePath = path.join(DATA_DIR, safeName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error('File not found');
  }
  if (safeName.toLowerCase() !== 'visits.csv') {
    fs.copyFileSync(sourcePath, DATA_PATH);
  }
  return { ok: true, activeFile: 'visits.csv' };
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1250,
    height: 860,
    minWidth: 1000,
    minHeight: 700,
    title: '4-H Pancake Breakfast Tracker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  ensureStorage();

  ipcMain.handle('config:get', () => {
    return readConfig();
  });

  ipcMain.handle('config:save', (_event, nextConfig) => {
    return saveConfig(nextConfig);
  });

  ipcMain.handle('data:appendVisit', (_event, payload) => {
    appendVisitRow(payload);
    return { ok: true };
  });

  ipcMain.handle('data:readVisits', () => {
    return readVisits();
  });

  ipcMain.handle('data:listFiles', () => {
    return listDataFiles();
  });

  ipcMain.handle('data:readVisitsFromFile', (_event, fileName) => {
    return readVisitsFromFile(fileName);
  });

  ipcMain.handle('data:copyFileToActive', (_event, fileName) => {
    return copyFileToActive(fileName);
  });

  ipcMain.handle('data:backupAndClear', () => {
    return backupAndClearData();
  });

  ipcMain.handle('window:toggleFullscreen', () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!win) {
      return false;
    }
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  ipcMain.handle('window:getFullscreen', () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    return win ? win.isFullScreen() : false;
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
