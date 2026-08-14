/* Packaged-runtime smoke for the Win32 directory-picker worker process. */

const { spawn } = require('node:child_process')
const { createRequire } = require('node:module')
const { join } = require('node:path')

const appRoot = process.env.DSH_PACKAGED_APP_ROOT
if (!appRoot) throw new Error('DSH_PACKAGED_APP_ROOT is required')
const appRequire = createRequire(join(appRoot, 'package.json'))
const koffi = appRequire('koffi')
const user32 = koffi.load('user32.dll')
const enumThreadWindows = user32.func('__stdcall', 'EnumThreadWindows', 'int', ['uint32', 'void *', 'intptr'])
const postMessageW = user32.func('__stdcall', 'PostMessageW', 'int', ['void *', 'uint32', 'uintptr', 'intptr'])
const protoEnumProc = koffi.proto('int __stdcall DshSmokeEnumThreadWndProc(void *hwnd, intptr lparam)')

function closeThreadWindows(threadId) {
  const callback = koffi.register((hwnd) => {
    postMessageW(hwnd, 0x10, 0, 0)
    return 1
  }, koffi.pointer(protoEnumProc))
  try {
    enumThreadWindows(threadId, callback, 0)
  } finally {
    koffi.unregister(callback)
  }
}

const worker = join(
  appRoot,
  'node_modules',
  '@deepseek-ai',
  'dsh-host-directory-picker-native',
  'lib',
  'worker.cjs',
)

const child = spawn(process.execPath, [worker], {
  env: { ...process.env, DSH_DIALOG_TITLE: 'Packaged directory-picker smoke' },
  stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  windowsHide: true,
})

let stderr = ''
let terminal = false
let closeTimer
const timeout = setTimeout(() => {
  child.kill()
  console.error(`directory-picker worker timed out${stderr === '' ? '' : `:\n${stderr}`}`)
  process.exitCode = 1
}, 10_000)

child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
child.on('message', (message) => {
  console.log(JSON.stringify(message))
  if (message.kind === 'showing') {
    closeTimer = setInterval(() => { closeThreadWindows(message.threadId) }, 100)
    closeThreadWindows(message.threadId)
    return
  }
  terminal = true
  if (closeTimer !== undefined) clearInterval(closeTimer)
  if (message.kind !== 'done' || message.path !== null) process.exitCode = 1
})
child.on('error', (error) => {
  clearTimeout(timeout)
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  clearTimeout(timeout)
  if (closeTimer !== undefined) clearInterval(closeTimer)
  if (!terminal) {
    console.error(`directory-picker worker exited before reporting (exit ${String(code)}, signal ${String(signal)})${stderr === '' ? '' : `:\n${stderr}`}`)
    process.exitCode = 1
  }
})
