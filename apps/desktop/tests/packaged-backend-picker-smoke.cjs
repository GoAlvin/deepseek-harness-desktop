/* End-to-end packaged smoke: desktop backend RPC reaches the Electron parent picker. */

const { spawn } = require('node:child_process')
const { join } = require('node:path')

const unpackedRoot = process.env.DSH_PACKAGED_UNPACKED_ROOT
const harnessHome = process.env.DSH_PACKAGED_SMOKE_HOME
if (!unpackedRoot) throw new Error('DSH_PACKAGED_UNPACKED_ROOT is required')
if (!harnessHome) throw new Error('DSH_PACKAGED_SMOKE_HOME is required')

const executable = join(unpackedRoot, 'DeepSeek Harness.exe')
const appRoot = join(unpackedRoot, 'resources', 'app')
const cliEntry = join(appRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const child = spawn(executable, ['--expose-internals', cliEntry, 'web', '--port', '0'], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    DSH_DESKTOP_PARENT_PICKER: '1',
    DSH_HOME: harnessHome,
    DSH_TELEMETRY_DISABLED: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  windowsHide: true,
})

child.on('message', (message) => {
  if (message?.type !== 'dsh:desktop-pick-directory') return
  child.send({
    type: 'dsh:desktop-pick-directory-result',
    requestId: message.requestId,
    result: { ok: true, path: null },
  })
})

let output = ''
let stopping = false
const timeout = setTimeout(() => {
  console.error(`packaged backend picker smoke timed out:\n${output}`)
  child.kill()
  process.exitCode = 1
}, 60_000)

function stop() {
  if (stopping) return
  stopping = true
  // This smoke owns only the RPC path; lifecycle behavior has separate tests.
  child.kill()
}

child.stdout.on('data', async (chunk) => {
  const text = chunk.toString()
  output += text
  process.stdout.write(text)
  const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/u.exec(output)
  if (!match || stopping) return

  try {
    const response = await fetch(`${match[1]}/api/host.pickDirectory`, {
      method: 'POST',
      headers: { 'connection': 'close', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'desktop-picker-smoke', method: 'host.pickDirectory', payload: {} }),
    })
    const body = await response.text()
    console.log(`picker-response ${response.status} ${body}`)
    if (response.status !== 200 || !body.includes('"path":null') || body.includes('"ok":false')) {
      process.exitCode = 1
    }
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    stop()
  }
})
child.stderr.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  process.stderr.write(text)
})
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  clearTimeout(timeout)
  if (!stopping || (code !== 0 && code !== null)) {
    console.error(`packaged backend exited unexpectedly (exit ${String(code)}, signal ${String(signal)})`)
    process.exitCode = 1
  }
})
