import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { officers, stages } from '../../src/data.ts'
import { openArchive } from './inspect-ls.mjs'

const project = fileURLToPath(new URL('../../', import.meta.url))
const source = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(project, '../jo')
const output = path.join(project, 'local-graphics', 'jo-assets')
const indexes = JSON.parse(fs.readFileSync(new URL('./portrait-indexes.json', import.meta.url), 'utf8'))
const decode = new TextDecoder('euc-kr')
const fromSource = (name) => path.join(source, name)

function extract(staging) {
  const config = decode.decode(fs.readFileSync(fromSource('System.ini')))
  const address = /^FileHead=([0-9a-f]+)\s*$/im.exec(config)?.[1]
  if (!address) throw new Error('System.ini에서 전투 조형 주소를 찾을 수 없습니다.')
  const table = Number.parseInt(address, 16)
  const executable = fs.readFileSync(fromSource('ekd5.exe'))
  const officersData = openArchive(fromSource('Data.e5')).read(0)
  const faces = openArchive(fromSource('Face.e5'))
  const sheets = {
    units: openArchive(fromSource('Unit_mov.E5')),
    attack: openArchive(fromSource('unit_atk.e5')),
    special: openArchive(fromSource('Unit_spc.E5')),
  }
  const wanted = new Set([...officers, ...stages.flatMap(({ enemies }) => enemies)].map(({ name }) => name))
  const mappings = {
    'ally-guard': 18, 'enemy-guard': 20,
    'ally-blade': 9, 'enemy-blade': 11,
    'ally-bow': 27, 'enemy-bow': 29,
    'ally-sage': 63, 'enemy-sage': 65,
    'ally-infantry': 9, 'enemy-infantry': 11,
    'ally-cavalry': 99, 'enemy-cavalry': 101,
    'ally-ranged': 36, 'enemy-ranged': 38,
  }
  const officerSprites = {}
  const portraits = {}

  for (let offset = 0; offset < officersData.length; offset += 32) {
    const name = decode.decode(officersData.subarray(offset, offset + 12)).split('\0')[0].trim()
    if (!wanted.delete(name)) continue
    const id = offset / 32
    const shape = executable.readUInt16LE(table + id * 2)
    if (!shape) continue
    const index = shape < 33 ? 720 + (shape - 1) * 3 : 783 + shape
    if (!sheets.units.records[index]) continue
    const key = `officer-${id}`
    mappings[key] = index
    officerSprites[name] = key
  }
  for (const [name, index] of Object.entries(indexes)) {
    const file = `portraits/${index}.jpg`
    const bytes = faces.read(index)
    if (bytes.readUInt16BE(0) !== 0xffd8) throw new Error(`초상화 ${index}의 형식이 예상과 다릅니다.`)
    fs.writeFileSync(path.join(staging, file), bytes)
    portraits[name] = file
  }
  for (const [kind, archive] of Object.entries(sheets)) {
    for (const index of new Set(Object.values(mappings))) {
      if (archive.records[index]) fs.writeFileSync(path.join(staging, `${kind}-${index}.bin`), archive.read(index))
    }
  }
  fs.writeFileSync(path.join(staging, 'palette.bin'), openArchive(fromSource('Spalet.e5')).read(0))
  fs.writeFileSync(path.join(staging, 'index.json'), JSON.stringify({ mappings, officerSprites, portraits }))
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'iron-pass-jo-'))
try {
  fs.mkdirSync(path.join(staging, 'portraits'))
  extract(staging)
  const renderer = fileURLToPath(new URL('./render.py', import.meta.url))
  const result = spawnSync('python', [renderer, staging], { stdio: 'inherit' })
  if (result.error || result.status !== 0) throw new Error('그래픽 변환을 실행하지 못했습니다. Python과 Pillow 설치를 확인하세요.')
  fs.mkdirSync(output, { recursive: true })
  for (const folder of ['portraits', 'units']) fs.cpSync(path.join(staging, folder), path.join(output, folder), { recursive: true })
  fs.copyFileSync(path.join(staging, 'manifest.json'), path.join(output, 'manifest.json'))
  console.log(`그래픽을 가져왔습니다. ${output}`)
} catch (error) {
  console.error(`${source}\n${error.message}`)
  process.exitCode = 1
} finally {
  for (const folder of ['portraits', 'units', '']) {
    const directory = path.join(staging, folder)
    if (!fs.existsSync(directory)) continue
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file))
    fs.rmdirSync(directory)
  }
}
