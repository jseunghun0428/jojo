import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { stageStorage } from '../tools/stage-storage.mjs'
import { stageDeployment } from '../src/data.ts'
import { webCampaign } from '../src/jo-game.ts'

function handler(writable, root) {
  let middleware
  stageStorage(writable, root).configureServer({
    middlewares: { use: (use) => { middleware = use } },
    config: { logger: { error() {} } },
  })
  return async (url, options = {}) => {
    let result
    const { body, host = '127.0.0.1:5174', origin = 'http://127.0.0.1:5174', method = body ? 'POST' : 'GET' } = options
    const request = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), {
      url, method, headers: { host, origin, 'content-type': 'application/json' },
    })
    await middleware(request, {
      writeHead(status, headers) { result = { status, headers } },
      end(data) {
        result.data = data
        if (result.headers['Content-Type'].startsWith('application/json')) result.json = JSON.parse(data.toString())
      },
    }, () => assert.fail('Unexpected middleware fallback for ' + url))
    return result
  }
}

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+A+N4AAAAASUVORK5CYII='

test('saves image and catalog together, keeps the previous image, and preserves the active revision on failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'iron-pass-stage-editor-'))
  const editor = handler(true, root)
  const game = handler(false, root)
  const catalogPath = '/stage-data/catalog.json'
  const applyPath = '/stage-data/apply'
  const stage = webCampaign.stages[0]
  const entry = {
    id: 'web:1', source: 'web',
    stage: {
      ...stage, name: '편집한 전장', deployment: stageDeployment(stage),
      board: { cellSize: 10, x: 3, y: 9, image: png, imageWidth: 1, imageHeight: 1 },
    },
  }
  try {
    const empty = await game(catalogPath)
    const payload = { entry, revision: empty.headers.ETag }
    assert.equal((await game(applyPath, { body: payload })).status, 404)
    assert.equal((await editor(applyPath, { body: payload, origin: 'https://other.test' })).status, 403)
    assert.equal((await editor(applyPath, { body: { ...payload, entry: {
      ...entry, stage: { ...entry.stage, board: { ...entry.stage.board, image: 'data:image/png;base64,AA==' } },
    } } })).status, 400)

    const first = await editor(applyPath, { body: payload })
    assert.equal(first.status, 200)
    const storedImage = first.json.entry.stage.board.image
    assert.match(storedImage, /^\/stage-data\/images\/[a-f0-9]{64}\.png$/)
    assert.deepEqual((await game(storedImage)).data, Buffer.from(png.split(',')[1], 'base64'))
    assert.equal((await editor(applyPath, { body: payload })).status, 409)

    const withoutImage = { ...entry, stage: { ...entry.stage, name: '새 버전', board: { cellSize: 12, x: 0, y: 0 } } }
    const second = await editor(applyPath, { body: { entry: withoutImage, revision: first.json.revision } })
    assert.equal(second.status, 200)
    assert.deepEqual((await game(catalogPath)).json.entries, [withoutImage])
    const backups = join(root, 'stage-data', 'backups')
    const snapshots = await Promise.all((await readdir(backups)).map(async (name) =>
      JSON.parse(await readFile(join(backups, name), 'utf8'))))
    assert.ok(snapshots.some(({ entries }) => entries.length === 0))
    assert.ok(snapshots.some(({ entries }) => entries[0]?.stage.board.image === storedImage))
    assert.equal((await game(storedImage)).status, 200)

    await rename(backups, join(root, 'stage-data', 'saved-backups'))
    await writeFile(backups, '')
    const failure = await editor(applyPath, { body: { entry, revision: second.json.revision } })
    assert.equal(failure.status, 500)
    const after = await game(catalogPath)
    assert.equal(after.headers.ETag, second.json.revision)
    assert.deepEqual(after.json.entries, [withoutImage])
    assert.equal((await game(storedImage)).status, 200)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
