/* Packaged-runtime smoke for native modules used by the Windows Web profile. */

const { createRequire } = require('node:module')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const appRoot = process.env.DSH_PACKAGED_APP_ROOT
if (!appRoot) throw new Error('DSH_PACKAGED_APP_ROOT is required')
const appRequire = createRequire(join(appRoot, 'package.json'))

async function main() {
  const koffi = appRequire('koffi')
  const kernel32 = koffi.load('kernel32.dll')
  const getCurrentProcessId = kernel32.func('uint32 GetCurrentProcessId()')
  if (getCurrentProcessId() !== process.pid) throw new Error('koffi process id mismatch')
  console.log('koffi-ok')

  const sharp = appRequire('sharp')
  const image = await sharp({
    create: { width: 2, height: 2, channels: 4, background: '#0b57d0' },
  }).png().toBuffer()
  if (image.length === 0) throw new Error('sharp produced an empty image')
  console.log('sharp-ok')

  const ripgrepEntry = join(appRoot, 'node_modules', '@vscode', 'ripgrep', 'lib', 'index.js')
  const { rgPath } = await import(pathToFileURL(ripgrepEntry).href)
  if (typeof rgPath !== 'string' || rgPath === '') throw new Error('ripgrep path is missing')
  console.log('ripgrep-ok')

  const pty = appRequire('node-pty')
  await new Promise((resolve, reject) => {
    let output = ''
    const terminal = pty.spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'echo dsh-native-ok'])
    const timeout = setTimeout(() => {
      terminal.kill()
      reject(new Error('node-pty smoke timed out'))
    }, 10_000)
    terminal.onData(data => { output += data })
    terminal.onExit(() => {
      clearTimeout(timeout)
      if (output.includes('dsh-native-ok')) resolve()
      else reject(new Error(`node-pty output was unexpected: ${JSON.stringify(output)}`))
    })
  })
  console.log('node-pty-ok')
}

main().then(() => {
  process.exit(0)
}).catch((error) => {
  console.error(error)
  process.exit(1)
})
