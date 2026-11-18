import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer as probePort } from 'node:net'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runningGamePort } from './game-server.mjs'

const args = process.argv.slice(2)
const host = '127.0.0.1'

async function useVite(args) {
  const require = createRequire(import.meta.url)
  const cli = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
  process.argv = [process.execPath, cli, '--host', host, ...args]
  await import(pathToFileURL(cli).href)
}

function defaultPortAvailable() {
  return new Promise((resolve, reject) => {
    const probe = probePort()
    probe.once('error', error => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false)
      else reject(error)
    })
    probe.listen(5173, host, () => probe.close(() => resolve(true)))
  })
}

if (args.some(arg => arg !== '--open')) {
  // Explicit CLI options (including the stage editor's port and mode) keep their previous behavior.
  await useVite(['--strictPort', ...args])
} else {
  const existing = await runningGamePort()
  if (existing) {
    const url = 'http://' + host + ':' + existing + '/'
    console.log('Game already running: ' + url)
    if (args.includes('--open')) {
      const launcher = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
      const arguments_ = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
      const child = spawn(launcher, arguments_, { detached: true, stdio: 'ignore', windowsHide: true })
      child.on('error', () => console.log('Open the game in your browser: ' + url))
      child.unref()
    }
  } else {
    // 5174 is the stage editor's default port.
    const port = await defaultPortAvailable() ? 5173 : 5175
    await useVite(['--port', String(port), ...args])
  }
}
