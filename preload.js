const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication & Scraping
  startAuth:       () => ipcRenderer.invoke('start-auth'),
  startScraping:   () => ipcRenderer.invoke('start-scraping'),

  // Events from Main
  onUsageData:     (cb) => ipcRenderer.on('usage-data', (_, data) => cb(data)),
  onScrapeError:   (cb) => ipcRenderer.on('scrape-error', (_, err) => cb(err)),

  // UI Control
  toggleWidgetMode: () => ipcRenderer.send('toggle-widget-mode'),
  onModeChanged:    (cb) => ipcRenderer.on('mode-changed', (_, mode) => cb(mode)),
});
