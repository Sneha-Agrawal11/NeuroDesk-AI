const { contextBridge, ipcRenderer } = require('electron');

// Expose native desktop APIs to the Next.js frontend
contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  // We can add more native bindings here (e.g., system tray, notifications, OS info)
});
