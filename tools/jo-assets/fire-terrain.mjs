import fs from 'node:fs'

export function readFireTerrain(file) {
  const dll = fs.readFileSync(file)
  const pe = dll.readUInt32LE(0x3c)
  const optional = pe + 24
  const sections = optional + dll.readUInt16LE(pe + 20)
  const resourceRva = dll.readUInt32LE(optional + 112)
  const sectionCount = dll.readUInt16LE(pe + 6)
  function fileOffset(rva) {
    for (let i = 0; i < sectionCount; i++) {
      const section = sections + 40 * i
      const start = dll.readUInt32LE(section + 12)
      if (rva >= start && rva < start + dll.readUInt32LE(section + 16)) {
        return dll.readUInt32LE(section + 20) + rva - start
      }
    }
    throw new Error('Mapatr.dll의 지형 이미지 위치를 읽을 수 없습니다.')
  }
  const root = fileOffset(resourceRva)
  function resourceEntry(directory, id) {
    const count = dll.readUInt16LE(directory + 12) + dll.readUInt16LE(directory + 14)
    for (let i = 0; i < count; i++) {
      const entry = directory + 16 + i * 8
      if (id === undefined || dll.readUInt32LE(entry) === id) return root + (dll.readUInt32LE(entry + 4) & 0x7fffffff)
    }
    throw new Error('Mapatr.dll에서 불 지형 이미지를 찾을 수 없습니다.')
  }
  // RT_BITMAP resources omit the 14-byte BMP file header.
  const data = resourceEntry(resourceEntry(resourceEntry(root, 2), 126))
  const start = fileOffset(dll.readUInt32LE(data))
  const dib = dll.subarray(start, start + dll.readUInt32LE(data + 4))
  if (dib.readUInt32LE(0) !== 40 || dib.readUInt32LE(4) !== 48 || dib.readInt32LE(8) !== 48 || dib.readUInt16LE(14) !== 8) {
    throw new Error('Mapatr.dll의 불 지형 이미지 형식이 다릅니다.')
  }
  const header = Buffer.alloc(14)
  header.write('BM')
  header.writeUInt32LE(header.length + dib.length, 2)
  header.writeUInt32LE(header.length + 40 + 4 * (dib.readUInt32LE(32) || 256), 10)
  return Buffer.concat([header, dib])
}
