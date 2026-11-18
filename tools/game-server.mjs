import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const directory = resolve('node_modules/.cache/seven-game')
const identityPath = '/__seven_game_server'
const heartbeatMs = 2000

export function gameServerDiscovery() {
  return {
    name: 'game-server-discovery',
    configureServer(server) {
      const http = server.httpServer
      if (!http) return
      const token = randomUUID()
      server.middlewares.use((req, res, next) => {
        if (req.url !== identityPath) return next()
        res.setHeader('Cache-Control', 'no-store')
        res.end(token)
      })
      http.once('listening', () => {
        const file = join(directory, http.address().port + '-' + token)
        mkdirSync(directory, { recursive: true })
        writeFileSync(file, '')
        const heartbeat = setInterval(() => {
          const now = new Date()
          try { utimesSync(file, now, now) } catch { clearInterval(heartbeat) }
        }, heartbeatMs)
        heartbeat.unref()
        http.once('close', () => {
          clearInterval(heartbeat)
          try { unlinkSync(file) } catch { /* Already removed. */ }
        })
      })
    },
  }
}

async function isRunning({ port, token, file }) {
  try {
    const response = await fetch('http://127.0.0.1:' + port + identityPath, {
      signal: AbortSignal.timeout(1200), redirect: 'error',
    })
    return response.ok && await response.text() === token
  } catch (error) {
    // Some Windows sandboxes permit binding loopback but block even local HTTP clients.
    if (error.cause?.code !== 'EACCES' && error.cause?.code !== 'EPERM') return false
    try {
      const before = statSync(file).mtimeMs
      if (Date.now() - before > 3 * heartbeatMs) return false
      await delay(heartbeatMs + 250)
      return statSync(file).mtimeMs > before
    } catch { return false }
  }
}

export async function runningGamePort() {
  let files
  try { files = readdirSync(directory) } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  const records = files.flatMap(name => {
    const match = /^(\d{1,5})-([a-f0-9-]{36})$/.exec(name)
    return match ? [{ port: Number(match[1]), token: match[2], file: join(directory, name) }] : []
  }).sort((a, b) => a.port - b.port)
  const active = await Promise.all(records.map(isRunning))
  return records.find((_, index) => active[index])?.port
}
