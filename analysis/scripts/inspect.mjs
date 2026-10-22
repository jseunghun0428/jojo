import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const input = path.join(root, 'input/tool');
const output = path.join(root, 'output');
fs.mkdirSync(output, { recursive: true });
const hex = n => `0x${n.toString(16).toUpperCase()}`;
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const kr = new TextDecoder('euc-kr');
const zstr = (b, at) => { const end = b.indexOf(0, at); return b.toString('ascii', at, end < 0 ? b.length : end); };
function entropy(b) {
  const counts = new Uint32Array(256);
  for (const n of b) counts[n]++;
  let h = 0;
  for (const n of counts) if (n) { const p = n / b.length; h -= p * Math.log2(p); }
  return Number(h.toFixed(4));
}
function asciiStrings(b, min = 5) {
  const result = [];
  const rx = new RegExp(`[\\x20-\\x7e]{${min},}`, 'g');
  for (const match of b.toString('latin1').matchAll(rx)) result.push({ offset: hex(match.index), text: match[0] });
  return result;
}
function utf16Strings(b, min = 4) {
  const result = [];
  for (const shift of [0, 1]) {
    const str = b.subarray(shift, b.length - (b.length - shift) % 2).toString('utf16le');
    const rx = new RegExp(`[\\x20-\\x7e\\uAC00-\\uD7A3\\u4E00-\\u9FFF]{${min},}`, 'g');
    for (const match of str.matchAll(rx)) result.push({ offset: hex(shift + match.index * 2), text: match[0] });
  }
  return result;
}
function versionInfo(b, start, size) {
  const values = {};
  const warnings = [];
  const align4 = n => (n + 3) & ~3;
  function block(at, limit, depth) {
    if (depth > 6 || at + 6 > limit) return;
    const length = b.readUInt16LE(at), valueLength = b.readUInt16LE(at + 2), type = b.readUInt16LE(at + 4);
    if (length < 6 || at + length > limit) return;
    const end = at + length;
    let p = at + 6;
    while (p + 2 <= end && b.readUInt16LE(p) !== 0) p += 2;
    const key = b.toString('utf16le', at + 6, p);
    p = align4(p + 2);
    let valueBytes = type === 1 ? valueLength * 2 : valueLength;
    if (type === 1 && p + valueBytes > end && p + valueLength <= end) {
      valueBytes = valueLength;
      warnings.push(`${key}: nonstandard wValueLength appears to count bytes instead of UTF-16 code units`);
    }
    if (type === 1 && valueLength && p + valueBytes <= end) values[key] = b.toString('utf16le', p, p + valueBytes).split('\0')[0];
    p = align4(p + valueBytes);
    while (p + 6 <= end) { const childLength = b.readUInt16LE(p); if (childLength < 6) break; block(p, end, depth + 1); p = align4(p + childLength); }
  }
  block(start, start + size, 0);
  return { values, warnings };
}
function inspectPE(file) {
  const b = fs.readFileSync(path.join(input, file));
  if (b.toString('ascii', 0, 2) !== 'MZ') throw new Error(`${file}: missing MZ`);
  const pe = b.readUInt32LE(0x3c);
  if (b.toString('binary', pe, pe + 4) !== 'PE\0\0') throw new Error(`${file}: missing PE`);
  const machine = b.readUInt16LE(pe + 4);
  const count = b.readUInt16LE(pe + 6);
  const optionalSize = b.readUInt16LE(pe + 20);
  const opt = pe + 24;
  const is32 = b.readUInt16LE(opt) === 0x10b;
  const imageBase = is32 ? b.readUInt32LE(opt + 28) : Number(b.readBigUInt64LE(opt + 24));
  const directoriesAt = opt + (is32 ? 96 : 112);
  const sections = [];
  for (let i = 0; i < count; i++) {
    const at = opt + optionalSize + i * 40;
    const rawSize = b.readUInt32LE(at + 16), rawOffset = b.readUInt32LE(at + 20);
    sections.push({ name: b.toString('ascii', at, at + 8).replace(/\0.*$/, ''), virtualSize: b.readUInt32LE(at + 8), rva: b.readUInt32LE(at + 12), rawSize, rawOffset, characteristics: hex(b.readUInt32LE(at + 36)), entropy: entropy(b.subarray(rawOffset, rawOffset + rawSize)) });
  }
  const rvaOffset = rva => {
    const s = sections.find(s => rva >= s.rva && rva < s.rva + Math.max(s.virtualSize, s.rawSize));
    if (!s) { if (rva < b.readUInt32LE(opt + 60)) return rva; throw new Error(`${file}: unmapped RVA ${hex(rva)}`); }
    const delta = rva - s.rva;
    if (delta >= s.rawSize) throw new Error(`${file}: unbacked RVA ${hex(rva)}`);
    return s.rawOffset + delta;
  };
  const imports = [];
  const importRva = b.readUInt32LE(directoriesAt + 8);
  if (importRva) {
    let at = rvaOffset(importRva);
    while (b.readUInt32LE(at) || b.readUInt32LE(at + 12)) {
      const dll = zstr(b, rvaOffset(b.readUInt32LE(at + 12)));
      const lookup = b.readUInt32LE(at) || b.readUInt32LE(at + 16);
      const firstThunk = b.readUInt32LE(at + 16);
      const functions = [];
      let thunkAt = rvaOffset(lookup);
      for (let i = 0; ; i++, thunkAt += is32 ? 4 : 8) {
        const thunk = is32 ? b.readUInt32LE(thunkAt) : Number(b.readBigUInt64LE(thunkAt));
        if (!thunk) break;
        const ordinal = is32 ? (thunk >>> 31) !== 0 : thunk >= 2 ** 63;
        functions.push({ name: ordinal ? `ordinal:${thunk & 0xffff}` : zstr(b, rvaOffset(thunk) + 2), iatVA: hex(imageBase + firstThunk + i * (is32 ? 4 : 8)) });
      }
      imports.push({ dll, functions });
      at += 20;
    }
  }
  const resources = [];
  const resourceRva = b.readUInt32LE(directoriesAt + 16);
  if (resourceRva) {
    const base = rvaOffset(resourceRva);
    function walk(relative, names, depth) {
      if (depth > 4) return;
      const at = base + relative;
      const entries = b.readUInt16LE(at + 12) + b.readUInt16LE(at + 14);
      for (let i = 0; i < entries; i++) {
        const e = at + 16 + i * 8, name = b.readUInt32LE(e), target = b.readUInt32LE(e + 4);
        const label = name >>> 31 ? b.toString('utf16le', base + (name & 0x7fffffff) + 2, base + (name & 0x7fffffff) + 2 + b.readUInt16LE(base + (name & 0x7fffffff)) * 2) : name;
        if (target >>> 31) walk(target & 0x7fffffff, [...names, label], depth + 1);
        else {
          const dataAt = base + target, rva = b.readUInt32LE(dataAt), size = b.readUInt32LE(dataAt + 4), offset = rvaOffset(rva);
          const item = { path: [...names, label], rva: hex(rva), offset: hex(offset), size };
          if (names[0] === 16) item.versionInfo = versionInfo(b, offset, size);
          if (names[0] === 6) {
            item.strings = [];
            let p = offset;
            for (let j = 0; j < 16 && p < offset + size; j++) { const len = b.readUInt16LE(p); p += 2; if (len) item.strings.push({ id: (Number(names[1]) - 1) * 16 + j, text: b.toString('utf16le', p, p + len * 2) }); p += len * 2; }
          }
          resources.push(item);
        }
      }
    }
    walk(0, [], 0);
  }
  const strings = asciiStrings(b);
  fs.writeFileSync(path.join(output, `${path.basename(file)}.strings.json`), JSON.stringify(strings, null, 2));
  const details = { file, size: b.length, sha256: sha256(b), machine: hex(machine), format: is32 ? 'PE32' : 'PE32+', timestampRaw: b.readUInt32LE(pe + 8), linkerVersion: `${b[opt + 2]}.${b[opt + 3]}`, imageBase: hex(imageBase), entryPointVA: hex(imageBase + b.readUInt32LE(opt + 16)), subsystem: b.readUInt16LE(opt + 68), dllCharacteristics: hex(b.readUInt16LE(opt + 70)), clrDirectoryRva: hex(b.readUInt32LE(directoriesAt + 14 * 8)), sections, imports, resources, interestingStrings: strings.filter(s => /\.e5\b|\.dll\b|\.s[0-9]\b|\.sav\b|koei|ekd|\.cpp\b|\.pdb\b|\.ini\b|\.rs\b|\.map\b|\.exe\b/i.test(s.text)) };
  fs.writeFileSync(path.join(output, `${path.basename(file)}.pe.json`), JSON.stringify(details, null, 2));
  return details;
}
const files = ['Ekd5.exe', '형상편집기 6.6.exe', 'Scenario/CczSceneEditor2.exe', 'AutoDLL.dll', 'zlib.dll'];
const pe = files.map(inspectPE);
const dataFiles = ['Data.e5', 'Font.e5', 'Star.e5', 'Hexzmap.e5', 'imsg.e5', 'source/AddPmap.e5', 'E5/Dt.e5', 'E5/Hitarea.e5', 'E5/Effarea.e5'];
const data = dataFiles.map(file => {
  const b = fs.readFileSync(path.join(input, file));
  const strings = asciiStrings(b);
  fs.writeFileSync(path.join(output, `${file.replaceAll('/', '_')}.strings.json`), JSON.stringify(strings, null, 2));
  return { file, size: b.length, sha256: sha256(b), entropy: entropy(b), headerHex: b.subarray(0, 128).toString('hex').match(/.{1,32}/g), firstDwordsLE: Array.from({ length: Math.min(16, Math.floor(b.length / 4)) }, (_, i) => b.readUInt32LE(i * 4)), interestingStrings: strings.filter(s => /koei|\.e5|\.bmp|\.png|\.dll|\.exe/i.test(s.text)).slice(0, 30) };
});
for (const file of ['System.ini', 'AutoDLL.ini', 'Scenario/CczCustom.ini', 'Scenario/CczSceneEditor2.ini', 'Scenario/CczString.ini']) {
  const b = fs.readFileSync(path.join(input, file));
  fs.writeFileSync(path.join(output, `${file.replaceAll('/', '_')}.utf8.txt`), kr.decode(b));
}
const summary = { generatedAt: new Date().toISOString(), method: 'Static byte inspection only; no target executable or DLL was executed or loaded.', pe: pe.map(p => ({ file: p.file, size: p.size, machine: p.machine, imageBase: p.imageBase, entryPointVA: p.entryPointVA, clrDirectoryRva: p.clrDirectoryRva, imports: p.imports.map(d => ({ dll: d.dll, count: d.functions.length })), version: p.resources.filter(r => r.path[0] === 16), interestingStrings: p.interestingStrings })), data };
fs.writeFileSync(path.join(output, 'static-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
