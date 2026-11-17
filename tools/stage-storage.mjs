import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createJoCampaign } from '../src/jo-game.ts'
import { imageData, MAX_IMAGE_BYTES, readEntry, validateStage } from '../src/stage-library.ts'

const imagePattern = /^\/stage-data\/images\/([a-f0-9]{64}\.(png|jpg|webp))$/
const digest = (data) => createHash('sha256').update(data).digest('hex')
const empty = '{"version":1,"entries":[]}'
const types = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function checked(path, directory = false) {
  try {
    const info = await lstat(path)
    if (!(directory ? info.isDirectory() : info.isFile()) || info.isSymbolicLink()) {
      throw new Error('Unexpected stage storage file type')
    }
    return true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return false
  }
}

async function ensureDirectory(path) {
  if (!await checked(path, true)) {
    await mkdir(path).catch((error) => { if (error.code !== 'EEXIST') throw error })
    await checked(path, true)
  }
}

async function atomicWrite(directory, path, data) {
  const temporary = join(directory, randomUUID() + '.tmp')
  try {
    await writeFile(temporary, data, { flag: 'wx', flush: true })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

async function readBody(request) {
  const chunks = []
  let length = 0
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length
    if (length > 30 * 1024 * 1024) {
      request.resume()
      throw new RequestError(413, '요청이 너무 큽니다.')
    }
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new RequestError(400, 'JSON 요청 형식이 잘못되었습니다.') }
}

function decodeImage(url) {
  const [header, data] = url.split(',')
  const ext = header.includes('jpeg') ? 'jpg' : header.includes('webp') ? 'webp' : 'png'
  const bytes = Buffer.from(data ?? '', 'base64')
  const signature = ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : ext === 'jpg' ? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  if (!signature || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== data) {
    throw new RequestError(400, '지도 이미지 형식이나 크기가 잘못되었습니다.')
  }
  return { ext, bytes }
}

export function stageStorage(writable, root = process.cwd()) {
  const directory = join(root, 'stage-data')
  const catalogs = join(directory, 'catalog.json')
  const backups = join(directory, 'backups')
  const assets = join(directory, 'images')
  let writes = Promise.resolve()

  async function liveCatalog() {
    if (await checked(directory, true) && await checked(catalogs)) return readFile(catalogs)
    return Buffer.from(empty)
  }

  async function apply(payload) {
    let entry
    try {
      entry = readEntry(payload?.entry)
    } catch (error) {
      throw new RequestError(400, error.message)
    }
    let officers = {}
    if (entry.source === 'jo') {
      const manifest = join(root, 'local-graphics', 'jo-game', 'manifest.json')
      if (await checked(manifest)) officers = createJoCampaign(JSON.parse(await readFile(manifest, 'utf8'))).officers
    }
    const issues = validateStage(entry.stage, officers)
    if (issues.length) throw new RequestError(400, issues[0].message)

    const previous = await liveCatalog()
    if (payload.revision !== '"' + digest(previous) + '"') {
      throw new RequestError(409, '다른 창에서 프로젝트가 변경되었습니다. 초안을 저장한 후 편집기를 새로고침하세요.')
    }
    const catalog = JSON.parse(previous.toString('utf8'))
    const index = catalog.entries.findIndex(({ id }) => id === entry.id)
    const image = entry.stage.board.image
    let newImage
    if (imageData(image)) {
      if (!entry.stage.board.imageWidth) throw new RequestError(400, '지도 이미지 크기가 필요합니다.')
      const { ext, bytes } = decodeImage(image)
      const name = digest(bytes) + '.' + ext
      entry.stage.board.image = '/stage-data/images/' + name
      newImage = { name, bytes }
    } else if (image) {
      const saved = imagePattern.exec(image)
      const path = saved ? join(assets, saved[1]) : join(root, 'local-graphics', image.slice(1))
      if (saved && !await checked(assets, true) || !await checked(path)) {
        throw new RequestError(400, '참조 중인 지도 이미지가 없습니다. 이미지를 다시 불러오세요.')
      }
    }
    if (index === -1) catalog.entries.push(entry)
    else catalog.entries[index] = entry
    const next = Buffer.from(JSON.stringify(catalog, null, 2) + '\n')
    const revision = '"' + digest(next) + '"'
    if (digest(previous) === digest(next)) return { entry, revision }

    await ensureDirectory(directory)
    let createdImage
    try {
      if (newImage) {
        await ensureDirectory(assets)
        const path = join(assets, newImage.name)
        if (!await checked(path)) {
          await atomicWrite(assets, path, newImage.bytes)
          createdImage = path
        }
      }
      await ensureDirectory(backups)
      const name = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID() + '.json'
      await atomicWrite(backups, join(backups, name), previous)
      await atomicWrite(directory, catalogs, next)
    } catch (error) {
      if (createdImage) await rm(createdImage, { force: true }).catch(() => {})
      throw error
    }
    return { entry, revision }
  }

  function respond(response, status, data, type = 'application/json; charset=utf-8', headers = {}) {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
    response.end(data)
  }

  return {
    name: 'iron-pass-stage-storage',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0] ?? ''
        if (!path.startsWith('/stage-data/')) return next()
        try {
          if (path === '/stage-data/catalog.json' && request.method === 'GET') {
            const data = await liveCatalog()
            respond(response, 200, data, undefined, { ETag: '"' + digest(data) + '"' })
          } else if (path === '/stage-data/apply' && request.method === 'POST' && writable) {
            const host = request.headers.host
            if (!/^127\.0\.0\.1:\d+$/.test(host ?? '') || request.headers.origin !== 'http://' + host
              || !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) {
              throw new RequestError(403, '로컬 편집기 화면에서만 반영할 수 있습니다.')
            }
            const payload = await readBody(request)
            const saving = writes.then(() => apply(payload))
            writes = saving.catch(() => {})
            respond(response, 200, JSON.stringify(await saving))
          } else {
            const image = imagePattern.exec(path)
            if (image && request.method === 'GET' && await checked(directory, true) && await checked(assets, true)
              && await checked(join(assets, image[1]))) {
              respond(response, 200, await readFile(join(assets, image[1])), types[image[2]])
            } else throw new RequestError(404, '스테이지 파일을 찾을 수 없습니다.')
          }
        } catch (error) {
          if (!error.status) server.config.logger.error(String(error))
          respond(response, error.status ?? 500, JSON.stringify({ error: error.status ? error.message : '프로젝트 파일을 읽거나 저장하지 못했습니다.' }))
        }
      })
    },
  }
}
