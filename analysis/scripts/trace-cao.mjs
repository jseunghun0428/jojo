import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'input/tool/Data.e5'));
const exe = fs.readFileSync(path.join(root, 'input/tool/Ekd5.exe'));
const pe = JSON.parse(fs.readFileSync(path.join(root, 'output/Ekd5.exe.pe.json'), 'utf8'));
const kr = new TextDecoder('euc-kr', { fatal: true });
const hex = v => `0x${v.toString(16).toUpperCase()}`;
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
function evidence(stem) {
  const response = JSON.parse(fs.readFileSync(path.join(root, 'output/rea-cao', stem + '.json'), 'utf8'));
  const e = response.structuredContent ?? JSON.parse(response.content.find(c => c.type === 'text').text);
  if (response.isError) throw new Error(`REA call failed: ${stem}`);
  return { file: `output/rea-cao/${stem}.json`, evidenceId: e.evidence_id, procedure: e.normalized_result.procedure?.address ?? null };
}
function fileOffset(va) {
  const s = pe.sections.find(s => va - Number(pe.imageBase) >= s.rva && va - Number(pe.imageBase) < s.rva + s.rawSize);
  if (!s) throw new Error(`No source mapping for ${hex(va)}`);
  return s.rawOffset + va - Number(pe.imageBase) - s.rva;
}
const dataOffset = source.readUInt32BE(0x118);
const dataBytes = source.readUInt32BE(0x110);
if (dataBytes !== 32768 || source.readUInt32BE(0x114) !== dataBytes) throw new Error('Unexpected source entry0');
const id = 0, stride = 32;
const recordOffset = dataOffset + id * stride;
const record = source.subarray(recordOffset, recordOffset + stride);
const nameEnd = record.subarray(0, 12).indexOf(0);
if (nameEnd < 0) throw new Error('Name not terminated');
const name = kr.decode(record.subarray(0, nameEnd));
if (name !== '조조') throw new Error('The selected record is no longer Cao Cao');
const labels = ['무력', '통솔', '지력', '민첩', '행운'];
const dialogs = JSON.parse(fs.readFileSync(path.join(root, 'output/unit-dialogs.json'), 'utf8'));
const infoDialog = dialogs.find(d => d.resource[1] === 166);
const attributes = labels.map((label, i) => {
  const raw = record[0x12 + i], controlId = 0x7d1 + i;
  const control = infoDialog.controls.find(c => c.id === controlId);
  const staticLabel = infoDialog.controls.find(c => c.text === label);
  if (!control || !staticLabel || control.coordinates.y !== staticLabel.coordinates.y) throw new Error(`UI label mapping changed: ${label}`);
  return { name: label, sourceRelativeOffset: hex(0x12 + i), sourceFileOffset: hex(recordOffset + 0x12 + i), sourceType: 'uint8', raw, runtimeBaseByteOffset: hex(0x21 + i), runtimeWordCopyOffset: hex(0x11 + i * 2), runtimeWordType: 'uint16 LE', infoDialogControlId: hex(controlId), displayRule: 'raw << 1', initialDisplayValue: raw << 1, evidence: [evidence('unit-initialize'), evidence('unit-get-basic-attribute'), evidence('unit-info-basic-attributes')] };
});
const classId = record[0x1a];
const classPointerVA = 0x48bea8 + classId * 4;
const classStringVA = exe.readUInt32LE(fileOffset(classPointerVA));
const classStringOffset = fileOffset(classStringVA);
const className = kr.decode(exe.subarray(classStringOffset, exe.indexOf(0, classStringOffset)));
const hp = record.readUInt16LE(0x17), mp = record[0x19], level = record[0x1b] || 1;
const result = {
  generatedAt: new Date().toISOString(),
  method: 'Static source-byte and REA/Ghidra code trace; values below are derived initial values, not a runtime capture.',
  targetExeSha256: hash(exe), sourceDataSha256: hash(source),
  unit: { id, name, sourceEntry: 0, entryByteCount: dataBytes, recordCount: dataBytes / stride, recordBytes: stride, sourceFileOffset: hex(recordOffset), rawHex: record.toString('hex') },
  loadPath: [
    { stage: 'Load Data.e5 entry0 into the pointer held at 0x496F60', evidence: evidence('data-caller-41b666') },
    { stage: 'For IDs0..1023, resolve the internal unit address as [0x4CEA00] + id*0x48', evidence: evidence('unit-runtime-address') },
    { stage: 'Initialize the 72-byte unit from one 32-byte source record and return source+0x20', evidence: evidence('unit-initialize') },
    { stage: 'Single-unit reset also explicitly resolves sourceBase + id*0x20', evidence: evidence('unit-single-reset') },
    { stage: 'Basic attribute UI uses getBasicAttribute(index,1), then controls0x7D1..0x7D5', evidence: evidence('unit-info-basic-attributes') },
  ],
  name: { sourceRelativeOffset: '0x0', copiedBytes: 12, runtimeOffset: '0x8', displayScratchOffset: '0x37', displayName: name, evidence: [evidence('unit-initialize'), evidence('unit-get-name'), evidence('unit-info-extra-values')] },
  attributes,
  class: { sourceRelativeOffset: '0x1A', sourceType: 'uint8', rawId: classId, runtimeOffset: '0x2B', name: className, pointerTableVA: hex(classPointerVA), nameStringVA: hex(classStringVA), nameStringFileOffset: hex(classStringOffset), evidence: [evidence('unit-initialize'), evidence('unit-get-class'), evidence('class-get-name'), evidence('unit-select-basic-attributes')] },
  level: { sourceRelativeOffset: '0x1B', raw: record[0x1b], initial: level, runtimeOffset: '0x2C', initializationRule: '0 becomes1', evidence: [evidence('unit-initialize'), evidence('unit-get-level'), evidence('unit-info-extra-values')] },
  hpBase: { sourceRelativeOffset: '0x17', sourceType: 'uint16 LE', raw: hp, initialClampedValue: Math.min(hp, 500), runtimeOffset: '0x1B', evidence: [evidence('unit-initialize'), evidence('unit-get-hp'), evidence('unit-select-basic-attributes')], limitation: 'The HP getter applies additional functions;110 is a base value, not every in-game final/current HP.' },
  mpBase: { sourceRelativeOffset: '0x19', sourceType: 'uint8 in source', raw: mp, initialClampedValue: Math.min(mp, 250), runtimeOffset: '0x1F', evidence: [evidence('unit-initialize'), evidence('unit-get-mp'), evidence('unit-select-basic-attributes')], limitation: 'The MP getter applies additional functions;30 is a base value, not every in-game final/current MP.' },
  portraitSeed: { sourceRelativeOffset: '0xD', sourceType: 'uint16 LE', raw: record.readUInt16LE(0xd), runtimeOffset: '0x4', perUnitCacheBaseVA: '0x50F000', evidence: [evidence('unit-initialize'), evidence('unit-portrait-setup'), evidence('unit-get-portrait')], limitation: 'The getter uses the per-unit cache and adds7 for nonzero values; full image loading has not been reconstructed.' },
  unknownSourceFields: ['0x0C', '0x0F', '0x10', '0x11', '0x1C', '0x1D', '0x1E', '0x1F'],
  limitations: ['No game code was executed.', 'Loaded saves, scenario changes, leveling, equipment and status effects may change values after initialization.', 'The five uint16 copies at runtime0x11..0x19 are observed, but their full combat use/formulas were not reconstructed in this trace.', 'Register-return helper pseudocode can omit behavior; unit address and class-name lookup were checked against assembly.', 'Results apply to the supplied 1.0.6.6 binary; this is not a claim about every original Cao Cao game version.'],
};
fs.writeFileSync(path.join(root, 'output/cao-trace.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ unit: result.unit, class: className, level, initialDisplayAttributes: Object.fromEntries(attributes.map(a => [a.name, a.initialDisplayValue])), hpBase: hp, mpBase: mp }, null, 2));
