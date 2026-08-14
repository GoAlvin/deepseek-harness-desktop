/** Electron application host for the DeepSeek Harness browser UI. */

import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron'
import { startHarnessBackend, type HarnessBackend } from './backend.ts'
import { isAllowedNavigation, isExternalWebUrl } from './navigation.ts'

const APP_NAME = 'DeepSeek Harness'
const SMOKE_FLAG = '--smoke-test'
const assetsDirectory = fileURLToPath(new URL('../assets/', import.meta.url))
const iconPath = join(assetsDirectory, process.platform === 'win32' ? 'icon.ico' : 'icon-512.png')
const loadingPath = join(assetsDirectory, 'loading.html')
const loadingUrl = pathToFileURL(loadingPath).href
const smokeTest = process.argv.includes(SMOKE_FLAG)

let window: BrowserWindow | undefined
let backend: HarnessBackend | undefined
let backendStarting: Promise<HarnessBackend> | undefined
let quitting: Promise<void> | undefined
let allowQuit = false

function focusMainWindow(): void {
  if (window === undefined || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function installMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }],
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  const created = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: APP_NAME,
    icon: iconPath,
    backgroundColor: '#f7f7f5',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      backgroundThrottling: false,
    },
  })

  let harnessOrigin: string | undefined
  created.webContents.on('will-navigate', (event, target) => {
    if (isAllowedNavigation(target, harnessOrigin, loadingUrl)) return
    event.preventDefault()
    if (isExternalWebUrl(target)) void shell.openExternal(target)
  })
  created.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  created.webContents.on('will-attach-webview', (event) => { event.preventDefault() })
  created.once('ready-to-show', () => {
    if (!smokeTest) created.show()
  })
  created.on('closed', () => { window = undefined })
  void created.loadFile(loadingPath)

  const startup = startHarnessBackend({
    executable: process.execPath,
    cwd: app.getPath('home'),
    harnessHome: join(app.getPath('userData'), 'harness'),
    async pickDirectory(title) {
      const options: Electron.OpenDialogOptions = { title, properties: ['openDirectory'] }
      const result = created.isDestroyed()
        ? await dialog.showOpenDialog(options)
        : await dialog.showOpenDialog(created, options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    onOutput(stream, text) {
      const target = stream === 'stdout' ? process.stdout : process.stderr
      target.write(`[dsh] ${text}`)
    },
  })
  backendStarting = startup
  void startup.then(async (started) => {
    backend = started
    if (quitting !== undefined || created.isDestroyed()) {
      await started.stop()
      return
    }
    harnessOrigin = started.url.origin
    started.closed.then((outcome) => {
      if (quitting !== undefined || allowQuit) return
      const detail = [
        outcome.exitCode === null ? undefined : `exit ${String(outcome.exitCode)}`,
        outcome.signalCode === null ? undefined : `signal ${outcome.signalCode}`,
      ].filter(value => value !== undefined).join(', ')
      dialog.showErrorBox(APP_NAME, `本地 Harness 后端已停止${detail === '' ? '。' : `（${detail}）。`}`)
      app.quit()
    }).catch((error: unknown) => {
      console.error('DeepSeek Harness desktop: backend exit observer failed', error)
    })
    await created.loadURL(started.url.href)
    if (smokeTest) setTimeout(() => { app.quit() }, 250)
  }).catch((error: unknown) => {
    if (quitting !== undefined || allowQuit) return
    const message = error instanceof Error ? error.message : String(error)
    if (smokeTest) console.error(`${APP_NAME} 启动失败: ${message}`)
    else dialog.showErrorBox(`${APP_NAME} 启动失败`, message)
    app.exit(1)
  }).finally(() => {
    if (backendStarting === startup) backendStarting = undefined
  })

  return created
}

function beginQuit(): void {
  quitting ??= (async () => {
    try {
      const ownedBackend = backend ?? await backendStarting?.catch(() => undefined)
      await ownedBackend?.stop()
    } catch (error) {
      console.error('DeepSeek Harness desktop: backend shutdown failed', error)
    } finally {
      allowQuit = true
      app.quit()
    }
  })()
}

app.setName(APP_NAME)
const ownsInstance = app.requestSingleInstanceLock()

if (!ownsInstance) {
  app.quit()
} else {
  app.on('second-instance', focusMainWindow)
  app.on('before-quit', (event) => {
    if (allowQuit) return
    event.preventDefault()
    beginQuit()
  })
  app.on('window-all-closed', () => { app.quit() })
  app.on('activate', () => {
    if (window === undefined) window = createWindow()
    else focusMainWindow()
  })

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
    installMenu()
    window = createWindow()
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox(`${APP_NAME} 启动失败`, message)
    app.exit(1)
  })
}
