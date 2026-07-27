const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess;
let aiProcess;
let nextProcess;

const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hiddenInset', // Modern desktop look
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    // In dev, wait for Next.js to start and load localhost
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In prod, serve the static export of Next.js
    mainWindow.loadFile(path.join(__dirname, 'out/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServices() {
  const serverDir = path.join(__dirname, 'server');
  const aiDir = path.join(__dirname, 'ai-service');

  if (isDev) {
    // Start Express backend
    backendProcess = spawn('npx', ['nodemon', '--exec', 'tsx', 'src/index.ts'], {
      cwd: serverDir,
      shell: true,
      stdio: 'inherit'
    });

    // Start Python AI service
    const pythonExe = path.join(aiDir, '.venv', 'Scripts', 'python.exe');
    aiProcess = spawn(pythonExe, ['-m', 'uvicorn', 'main:app', '--reload', '--port', '8000'], {
      cwd: aiDir,
      shell: true,
      stdio: 'inherit'
    });
    
    // Next.js dev server should be run separately via `pnpm dev`, 
    // but we can spawn it here if desired.
  } else {
    // Production start scripts
    backendProcess = spawn('node', ['dist/index.js'], {
      cwd: serverDir,
      shell: true,
      stdio: 'inherit'
    });

    const pythonExe = path.join(aiDir, 'venv', 'Scripts', 'python.exe'); // assuming prod venv
    aiProcess = spawn(pythonExe, ['-m', 'uvicorn', 'main:app', '--port', '8000'], {
      cwd: aiDir,
      shell: true,
      stdio: 'inherit'
    });
  }
}

app.whenReady().then(() => {
  startServices();
  
  // Give services a moment to start before opening window in dev
  setTimeout(createWindow, isDev ? 5000 : 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
  if (aiProcess) aiProcess.kill();
});

// IPC Handlers for Desktop Native Features
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});
