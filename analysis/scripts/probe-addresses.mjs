import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const b = fs.readFileSync(path.join(root, 'input/tool/Ekd5.exe'));
const pe = JSON.parse(fs.readFileSync(path.join(root, 'output/Ekd5.exe.pe.json'), 'utf8'));
const imageBase = Number(pe.imageBase);
const hex = n => `0x${n.toString(16).toUpperCase()}`;
function toVA(offset) { const s = pe.sections.find(s => offset >= s.rawOffset && offset < s.rawOffset + s.rawSize); if (!s) throw new Error('unmapped offset'); return imageBase + s.rva + offset - s.rawOffset; }
function occurrences(va) {
  const needle = Buffer.alloc(4); needle.writeUInt32LE(va);
  const hits = [];
  for (const s of pe.sections.filter(s => s.name === '.code')) {
    let at = s.rawOffset;
    while ((at = b.indexOf(needle, at)) >= 0 && at < s.rawOffset + s.rawSize) { hits.push({ offset: hex(at), va: hex(toVA(at)), contextHex: b.subarray(Math.max(0, at - 8), at + 12).toString('hex') }); at += 4; }
  }
  return hits;
}
const ini = fs.readFileSync(path.join(root, 'output/System.ini.utf8.txt'), 'utf8');
const settings = {};
for (const m of ini.matchAll(/^([A-Za-z0-9]+)=([^;\r\n]+)/gm)) settings[m[1]] = m[2].trim();
const tables = [];
for (const [name, raw] of Object.entries(settings)) {
  if (!/^Mg/.test(name)) continue;
  const offset = Number(raw), count = Number(settings.SMagic), va = toVA(offset), values = Array.from(b.subarray(offset, offset + count));
  const histogram = {};
  for (const v of values) histogram[v] = (histogram[v] || 0) + 1;
  tables.push({ name, source: 'System.ini configured offset; field semantics not yet verified in code/runtime', offset: hex(offset), va: hex(va), count, histogram, values, rawCodeReferenceCandidates: occurrences(va) });
}
const string = pe.interestingStrings.find(s => s.text === 'DATA.E5');
const dataString = { ...string, va: hex(toVA(Number(string.offset))), rawCodeReferenceCandidates: occurrences(toVA(Number(string.offset))) };
const result = { dataString, tables, classAffinityCandidate: { configuredOffset: settings.UserXK, va: hex(toVA(parseInt(settings.UserXK, 16))), configuredXgh: settings.Xgh, first128Hex: b.subarray(parseInt(settings.UserXK, 16), parseInt(settings.UserXK, 16) + 128).toString('hex'), note: 'Matrix dimensions and field interpretation remain unverified' } };
fs.writeFileSync(path.join(root, 'output/address-probes.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ dataString, tables: tables.map(({ values, ...t }) => t), classAffinityCandidate: result.classAffinityCandidate }, null, 2));
