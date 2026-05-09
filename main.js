const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ===========================
// مسارات ملفات البيانات
// ===========================
const DATA_PATH = path.join(app.getPath('userData'), 'claude_usage_data.json');

// User Agent حقيقي لمتصفح Chrome حتى لا يحجب موقع Claude النوافذ
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

let mainWindow = null;
let tray = null;
let isWidgetMode = false;

// أبعاد النوافذ
const NORMAL_SIZE = { width: 950, height: 720 };
const WIDGET_SIZE = { width: 400, height: 360 };

// ===========================
// إنشاء النافذة الرئيسية
// ===========================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: NORMAL_SIZE.width,
    height: NORMAL_SIZE.height,
    minWidth: 400,
    minHeight: 260,
    frame: true,
    transparent: false,
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    backgroundColor: '#13110F',
    title: 'Claude Monitor',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenu(null); // إخفاء شريط القوائم الافتراضي
  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // منع إغلاق التطبيق عند إغلاق النافذة - الإخفاء في الـ Tray بدلاً من ذلك
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ===========================
// إنشاء System Tray
// ===========================
function createTray() {
  // استخدام أيقونة مضمنة بسيطة إذا لم تكن الأيقونة موجودة
  let iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // أيقونة افتراضية
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Claude Monitor');

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📊 فتح لوحة التحكم',
      click: () => {
        if (mainWindow) {
          setNormalMode();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: isWidgetMode ? '🖥️ وضع عادي' : '📌 وضع Widget',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          if (isWidgetMode) {
            setNormalMode();
          } else {
            setWidgetMode();
          }
        }
      }
    },
    { type: 'separator' },
    {
      label: '🔗 Anthropic Console',
      click: () => shell.openExternal('https://console.anthropic.com/settings/usage')
    },
    { type: 'separator' },
    {
      label: '❌ إنهاء التطبيق',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  if (tray) tray.setContextMenu(contextMenu);
}

// ===========================
// Widget Mode / Normal Mode
// ===========================
function setWidgetMode() {
  isWidgetMode = true;
  mainWindow.setSize(WIDGET_SIZE.width, WIDGET_SIZE.height);
  mainWindow.setResizable(false);
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setSkipTaskbar(true);
  // تحديد موضع في الزاوية السفلية اليمنى
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  mainWindow.setPosition(sw - WIDGET_SIZE.width - 16, sh - WIDGET_SIZE.height - 16);

  mainWindow.webContents.send('mode-changed', 'widget');
  updateTrayMenu();
}

function setNormalMode() {
  isWidgetMode = false;
  mainWindow.setResizable(true);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setSkipTaskbar(false);
  mainWindow.setSize(NORMAL_SIZE.width, NORMAL_SIZE.height);
  mainWindow.center();
  mainWindow.webContents.send('mode-changed', 'normal');
  updateTrayMenu();
}

// ===========================
// IPC Handlers
// ===========================

// قراءة بيانات الاستخدام
ipcMain.handle('load-data', () => {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
    return [];
  } catch { return []; }
});

// حفظ بيانات الاستخدام
ipcMain.handle('save-data', (_, data) => {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// فتح ملف CSV
ipcMain.handle('open-csv', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'استيراد ملف CSV من Anthropic',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return fs.readFileSync(result.filePaths[0], 'utf8');
});

// تصدير JSON
ipcMain.handle('export-json', async (_, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'تصدير بيانات الاستخدام',
    defaultPath: `claude-usage-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled) return false;
  fs.writeFileSync(result.filePath, content, 'utf8');
  return true;
});

// استيراد JSON
ipcMain.handle('import-json', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'استيراد بيانات JSON',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return fs.readFileSync(result.filePaths[0], 'utf8');
});

// تبديل الوضع من الـ renderer
ipcMain.on('toggle-widget-mode', () => {
  if (isWidgetMode) {
    setNormalMode();
  } else {
    setWidgetMode();
  }
});

// ===========================
// Scraping & Auth Logic
// ===========================
let authWindow = null;
let scraperWindow = null;
let scanInterval = null;

// تسجيل الدخول
ipcMain.handle('start-auth', async () => {
  if (authWindow) {
    authWindow.focus();
    return;
  }
  authWindow = new BrowserWindow({
    width: 800, height: 700,
    title: 'Login to Claude',
    webPreferences: {
      partition: 'persist:claude',
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  authWindow.webContents.setUserAgent(CHROME_UA);
  authWindow.loadURL('https://claude.ai/login');
  
  authWindow.on('closed', () => {
    authWindow = null;
    performAutoScrape();
  });
});

// بدء السحب
ipcMain.handle('start-scraping', async () => {
  performAutoScrape();
});

let autoScrapeTimer = null;

// ======================================================
// السحب الأوتوماتيكي الكامل (بدون تدخل المستخدم)
// 1. يفتح الصفحة الرئيسية (مخفية) لتثبيت الجلسة
// 2. ينتقل لصفحة الاستهلاك من داخل الصفحة
// 3. يقرأ الأرقام ويرسلها للواجهة
// 4. يعيد نفسه كل 3 دقائق
// ======================================================
async function performAutoScrape() {
  // إنشاء نافذة مخفية إذا لم تكن موجودة
  if (!scraperWindow) {
    scraperWindow = new BrowserWindow({
      show: false,  // مخفية تماماً
      width: 1000, height: 700,
      webPreferences: {
        partition: 'persist:claude',
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    scraperWindow.webContents.setUserAgent(CHROME_UA);
    
    scraperWindow.setMenu(null);
    
    scraperWindow.on('closed', () => {
      scraperWindow = null;
      if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
    });
  }

  try {
    console.log('[SCRAPER] Step 1: Loading claude.ai...');
    await scraperWindow.loadURL('https://claude.ai/');
    
    // انتظار تحميل الصفحة وتثبيت الجلسة
    await new Promise(r => setTimeout(r, 5000));
    
    // التحقق من تسجيل الدخول
    const currentURL = scraperWindow.webContents.getURL();
    console.log('[SCRAPER] Current URL:', currentURL);
    
    if (currentURL.includes('login') || currentURL.includes('oauth')) {
      // المستخدم غير مسجل الدخول - نفتح نافذة تسجيل الدخول
      console.log('[SCRAPER] Not logged in. Opening auth window...');
      scraperWindow.close();
      scraperWindow = null;
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scrape-error', 'يرجى تسجيل الدخول أولاً');
      }
      
      // فتح نافذة تسجيل الدخول تلقائياً
      if (!authWindow) {
        authWindow = new BrowserWindow({
          width: 800, height: 700,
          title: 'Login to Claude',
          webPreferences: {
            partition: 'persist:claude',
            nodeIntegration: false,
            contextIsolation: true
          }
        });
        authWindow.webContents.setUserAgent(CHROME_UA);
        authWindow.loadURL('https://claude.ai/login');
        authWindow.on('closed', () => {
          authWindow = null;
          // بعد تسجيل الدخول، نحاول السحب مرة أخرى
          setTimeout(() => performAutoScrape(), 2000);
        });
      }
      return;
    }

    // المستخدم مسجل الدخول - ننتقل لصفحة الاستهلاك
    console.log('[SCRAPER] Step 2: Navigating to /settings/usage...');
    
    // الانتقال عبر client-side routing (بدلاً من تحميل رابط مباشر)
    await scraperWindow.webContents.executeJavaScript(
      'window.location.href = "https://claude.ai/settings/usage"'
    );
    
    // انتظار تحميل صفحة الإعدادات
    await new Promise(r => setTimeout(r, 6000));
    
    console.log('[SCRAPER] Step 3: Scanning for usage data...');
    
    // بدء المسح الحي
    startLiveScanning();
    
  } catch (err) {
    console.error('[SCRAPER] Error:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scrape-error', err.message);
    }
  }
}

// ======================================================
// المسح الحي: يقرأ النص من الصفحة كل ثانيتين
// ======================================================
function startLiveScanning() {
  if (scanInterval) clearInterval(scanInterval);
  
  let attempts = 0;
  const MAX_ATTEMPTS = 15; // 30 ثانية كحد أقصى
  
  scanInterval = setInterval(async () => {
    if (!scraperWindow || scraperWindow.isDestroyed()) {
      clearInterval(scanInterval);
      scanInterval = null;
      return;
    }
    
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      console.log('[SCRAPER] Max attempts reached. Stopping scan.');
      clearInterval(scanInterval);
      scanInterval = null;
      
      // جدولة المحاولة القادمة بعد 3 دقائق
      scheduleNextScrape();
      return;
    }

    try {
      const pageText = await scraperWindow.webContents.executeJavaScript(
        'document.body ? document.body.innerText : ""'
      );
      
      if (!pageText || pageText.length < 50) return;
      
      const hasUsageData = pageText.includes('used') && 
        (pageText.includes('Current session') || pageText.includes('Plan usage limits'));
      
      if (hasUsageData) {
        console.log('[SCRAPER] Usage data detected!');
        
        const text = pageText.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ');
        
        let result = {
          session: { percent: '0%', resets: 'Unknown' },
          allModels: { percent: '0%', resets: 'Unknown' },
          design: { percent: '0%', resets: 'Unknown' },
          routineRuns: '0/5',
          timestamp: new Date().toLocaleTimeString()
        };

        const sMatch = text.match(/Current session.*?(\d+)%\s*used.*?Resets\s+(\S+\s+\S+(?:\s+\S+)?)/i);
        if (sMatch) {
          result.session.percent = sMatch[1] + '%';
          result.session.resets = 'Resets ' + sMatch[2].trim();
        }
        
        // البحث عن كل مطابقات "X% used ... Resets ..." بالترتيب
        const allPercents = [...text.matchAll(/(\d+)%\s*used/gi)];
        const allResets = [...text.matchAll(/Resets\s+(\S+\s+\S+(?:\s+\S+)?)/gi)];
        
        // القيم بالترتيب: [0] = Current session, [1] = All models (weekly), [2] = Claude Design
        if (allPercents.length >= 1) {
          result.session.percent = allPercents[0][1] + '%';
        }
        if (allPercents.length >= 2) {
          result.allModels.percent = allPercents[1][1] + '%';
        }
        if (allPercents.length >= 3) {
          result.design.percent = allPercents[2][1] + '%';
        }
        
        if (allResets.length >= 1) {
          result.session.resets = 'Resets ' + allResets[0][1].trim();
        }
        if (allResets.length >= 2) {
          result.allModels.resets = 'Resets ' + allResets[1][1].trim();
        }
        if (allResets.length >= 3) {
          result.design.resets = 'Resets ' + allResets[2][1].trim();
        }
        
        const rMatch = text.match(/Daily included routine runs.*?(\d+)\s*\/\s*(\d+)/i);
        if (rMatch) {
          result.routineRuns = rMatch[1] + '/' + rMatch[2];
        }

        console.log('[SCRAPER] Extracted:', JSON.stringify(result));

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('usage-data', result);
        }
        
        clearInterval(scanInterval);
        scanInterval = null;
        
        // جدولة التحديث التالي بعد 3 دقائق
        scheduleNextScrape();
      }
    } catch (err) {
      // تجاهل الأخطاء
    }
  }, 2000);
}

// جدولة السحب التالي كل 3 دقائق
function scheduleNextScrape() {
  if (autoScrapeTimer) clearTimeout(autoScrapeTimer);
  autoScrapeTimer = setTimeout(() => {
    console.log('[SCRAPER] Auto-refresh triggered (3 min interval)');
    performAutoScrape();
  }, 3 * 60 * 1000);
}


// ===========================
// تهيئة التطبيق
// ===========================
app.whenReady().then(() => {
  // تعيين User Agent على كل الـ sessions لتجنب الحجب
  const { session } = require('electron');
  session.fromPartition('persist:claude').setUserAgent(CHROME_UA);

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // لا نغلق التطبيق - يبقى في الـ Tray
  }
});
