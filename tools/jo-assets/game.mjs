import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openArchive } from './inspect-ls.mjs'

const decode = new TextDecoder('euc-kr')
const nameOf = (bytes) => decode.decode(bytes).split('\0')[0].trim()
const marker = (hex) => Buffer.from(hex, 'hex')
const mapCommand = marker('27002d0003000c00ffff1a00ffff1c00ffff1500')
const deploymentCommand = marker('4b000400')
const facings = ['up', 'right', 'down', 'left']

function attackPattern(bytes) {
  if (bytes.length !== 64 * 64) throw new Error('공격 범위 이미지 크기가 다릅니다.')
  if (bytes.every((color) => color === 40)) return 'all'
  const center = bytes.indexOf(58)
  if (center < 0) throw new Error('공격 범위 중심을 찾을 수 없습니다.')
  // Sample at cell centers. The image includes thin grid lines and edge pixels.
  const x0 = center % 64
  const y0 = Math.floor(center / 64)
  const stride = bytes.subarray(center).findIndex((color) => color !== 58) + 1
  if (stride < 4 || stride > 9) throw new Error('공격 범위 칸 크기가 다릅니다.')
  const offsets = []
  const middle = Math.floor((stride - 1) / 2)
  for (let y = -8; y <= 8; y++) {
    for (let x = -8; x <= 8; x++) {
      const col = x0 + x * stride + middle
      const row = y0 + y * stride + middle
      if (col >= 0 && col < 64 && row >= 0 && row < 64 && bytes[row * 64 + col] === 40) offsets.push({ x, y })
    }
  }
  return offsets
}

function readDeployment(script, before) {
  const groups = []
  for (let p = script.indexOf(deploymentCommand, 22); p >= 0 && p < before; p = script.indexOf(deploymentCommand, p + 1)) {
    const u = (offset) => script.readUInt16LE(p + offset)
    if (u(8) !== 4 || u(14) !== 4 || u(20) !== 43 || u(24) !== 38) continue
    const slot = u(4)
    if (slot === 0) groups.push([])
    const group = groups.at(-1)
    if (group) group.push({ slot, x: u(10), y: u(16), facing: facings[u(22)], hidden: u(26) !== 0 })
    p += 27
  }
  return groups
}

function readFormations(script, before, hostile) {
  const tag = marker(hostile ? '47000200' : '46000200')
  const stride = hostile ? 56 : 52
  const count = hostile ? 80 : 20
  const delta = hostile ? 4 : 0
  const result = []
  for (let p = script.indexOf(tag, 22); p >= 0 && p < before; p = script.indexOf(tag, p + 1)) {
    if (script.readUInt16LE(p + 6) !== 38 || script.readUInt16LE(p + 10 + delta) !== 4) continue
    for (let slot = 0; slot < count; slot++) {
      const start = p + 2 + slot * stride
      const u = (offset) => script.readUInt16LE(start + offset)
      if (u(0) !== 2 || u(4) !== 38 || u(8 + delta) !== 4 || u(14 + delta) !== 4 || u(20 + delta) !== 43 || u(24 + delta) !== 62) {
        throw new Error('출전 편성 레코드가 예상 형식과 다릅니다.')
      }
      if (u(2) !== 0xffff) result.push({
        officer: u(2), visibility: u(6), reinforcement: hostile ? u(10) : 0,
        x: u(10 + delta), y: u(16 + delta), facing: facings[u(22 + delta)],
        levelOffset: u(26 + delta), behavior: u(34 + delta),
      })
    }
    p += count * stride + 1
  }
  return result
}

export function readJoGame(source, stageCount = 50) {
  const file = (...names) => path.join(source, ...names)
  const exe = fs.readFileSync(file('ekd5.exe'))
  const archive = openArchive(file('Data.e5'))
  const officers = archive.read(0)
  const classes = archive.read(3)
  const terrain = archive.read(4)
  const magic = archive.read(5)
  if (officers.length !== 1024 * 32 || classes.length !== 240 * 35 || terrain.length !== 160 * 60
      || nameOf(exe.subarray(0x14e970, 0x14e980)) !== '제후') throw new Error('신조조전 7.0 병종 테이블 형식이 다릅니다.')
  const hitArea = openArchive(file('Hitarea.e5'))
  const patterns = hitArea.records.map((_, index) => attackPattern(hitArea.read(index)))
  const classData = Array.from({ length: 240 }, (_, id) => {
    const start = 0x14e970 + id * 16
    const row = id < 120 ? Math.floor(id / 3) : id - 80
    const stats = [...classes.subarray(id * 35, (id + 1) * 35)]
    if (!patterns[stats[1]]) throw new Error(`병종 ${id}의 공격 범위 번호가 잘못되었습니다.`)
    return {
      name: nameOf(exe.subarray(start, start + 16)),
      stats,
      terrain: [...terrain.subarray(row * 60, (row + 1) * 60)],
      tacticLevels: Array.from({ length: Math.floor(magic.length / 257) }, (_, index) => magic[index * 257 + 17 + id]),
    }
  })
  const roster = Array.from({ length: 1024 }, (_, id) => {
    const start = id * 32
    return {
      name: nameOf(officers.subarray(start, start + 12)), classId: officers[start + 26],
      attributes: [...officers.subarray(start + 18, start + 23)],
      hp: officers.readUInt16LE(start + 23), mp: officers[start + 25], level: officers[start + 27],
    }
  })
  const terrainNames = decode.decode(exe.subarray(568944, 569155)).split('\0').slice(0, 30)
  const messages = fs.readFileSync(file('Imsg.e5'))
  const battleNames = decode.decode(messages).split('\0').filter(Boolean)
  const namesStart = battleNames.findIndex((name) => name.startsWith('Hex Battle Name Start'))
  if (namesStart < 0 || terrainNames.length !== 30 || terrainNames[0] !== '평지') throw new Error('전장 이름 또는 지형 이름을 찾지 못했습니다.')
  const mapArchive = openArchive(file('Hexzmap.e5'))
  const images = new Map(fs.readdirSync(file('Map')).map((name) => [name.toLowerCase(), name]))
  const stages = Array.from({ length: stageCount }, (_, index) => {
    const script = fs.readFileSync(file('Rs', `S_${String(index).padStart(2, '0')}.eex`))
    const mapAt = script.indexOf(mapCommand, 22)
    if (mapAt < 0 || script.toString('ascii', 0, 4) !== 'EEX\0') throw new Error(`전장 ${index}의 지도 명령을 찾을 수 없습니다.`)
    const mapId = script.readUInt16LE(mapAt + mapCommand.length)
    const bytes = mapArchive.read(mapId)
    const width = bytes[0] / 3
    const height = bytes[1] / 3
    const image = images.get(`m${String(mapId).padStart(3, '0')}.jpg`)
    const name = battleNames[namesStart + 1 + mapId]?.trim()
    const enemies = readFormations(script, mapAt, true)
    const guests = readFormations(script, mapAt, false)
    const deployment = readDeployment(script, mapAt)
    const formations = [...enemies, ...guests]
    if (!Number.isInteger(width) || !Number.isInteger(height) || width * height !== bytes.length - 2
        || !name || !image || !enemies.length || !deployment.length || formations.some((unit) => !roster[unit.officer])) {
      throw new Error(`전장 ${index}의 지도·배치 데이터가 예상 형식과 다릅니다.`)
    }
    const openingReinforcements = []
    if (index === 0) {
      // In S_00, the first two turn events contain the three guest reveals.
      const firstSceneEnd = script.readUInt32LE(14)
      const reveal = marker('4c00400000000200')
      const nextScene = script.readUInt32LE(18)
      for (let p = script.indexOf(reveal, firstSceneEnd); p >= 0 && p < nextScene && openingReinforcements.length < 3; p = script.indexOf(reveal, p + 1)) {
        openingReinforcements.push(script.readUInt16LE(p + reveal.length))
      }
      if (openingReinforcements.length !== 3) throw new Error('영천 전투의 우군 증원을 찾지 못했습니다.')
    }
    return {
      name, image, mapId,
      map: Array.from({ length: height }, (_, y) => [...bytes.subarray(2 + width * y, 2 + width * (y + 1))]),
      enemies, guests, deployment, openingReinforcements,
    }
  })
  return { version: 1, classes: classData, roster, patterns, terrainNames, stages }
}

const project = fileURLToPath(new URL('../../', import.meta.url))
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(project, '../jo')
  const output = path.join(project, 'local-graphics', 'jo-game')
  try {
    const pack = readJoGame(source)
    fs.mkdirSync(output, { recursive: true })
    for (const { image } of pack.stages) fs.copyFileSync(path.join(source, 'Map', image), path.join(output, image))
    const temporary = path.join(output, 'manifest.tmp')
    fs.writeFileSync(temporary, JSON.stringify(pack))
    fs.renameSync(temporary, path.join(output, 'manifest.json'))
    console.log(`신조조전 전장 ${pack.stages.length}개와 병종 ${pack.classes.length}개 슬롯을 가져왔습니다.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
