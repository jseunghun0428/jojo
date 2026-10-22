// Read-only byte inspection. This script does not infer gameplay field meanings.
// Run from the repository root: node analysis/scripts/cao-raw.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const source = path.join(root, 'analysis/output/extracted/Data/entry-00.bin');
const container = path.join(root, 'analysis/input/tool/Data.e5');
const destination = path.join(root, 'analysis/output/cao-raw.json');
const bytes = fs.readFileSync(source);
const containerBytes = fs.readFileSync(container);
const containerEntryOffset = 0x18C;
const stride = 32; // Byte-layout hypothesis here; independently verify in code.
const decoder = new TextDecoder('euc-kr', { fatal: true });
const hex = value => '0x' + value.toString(16).toUpperCase();
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
if (bytes.length !== 32768 || bytes.length % stride !== 0) throw new Error('Unexpected entry size');
if (!bytes.equals(containerBytes.subarray(containerEntryOffset, containerEntryOffset + bytes.length))) {
  throw new Error('Extracted entry differs from copied container range');
}

const rows = Array.from({ length: bytes.length / stride }, (_, candidateIndex) => {
  const entryOffset = candidateIndex * stride;
  const raw = bytes.subarray(entryOffset, entryOffset + stride);
  const firstNul = raw.subarray(0, 13).indexOf(0);
  if (firstNul < 0) throw new Error('No name terminator in first 13 bytes');
  return {
    candidateIndex,
    entryOffset,
    entryOffsetHex: hex(entryOffset),
    containerOffset: containerEntryOffset + entryOffset,
    containerOffsetHex: hex(containerEntryOffset + entryOffset),
    nameDecodedCp949: decoder.decode(raw.subarray(0, firstNul)),
    nameFirstNulRelativeOffset: firstNul,
    postNulNonzeroThrough12: Array.from(raw.subarray(firstNul + 1, 13), (value, i) => ({ relativeOffset: firstNul + 1 + i, value })).filter(row => row.value !== 0),
    rawHex: raw.toString('hex'),
    rawDecimalBytes: Array.from(raw),
  };
});

const histograms = Array.from({ length: stride }, (_, relativeOffset) => {
  const counts = new Map();
  for (const row of rows) {
    const value = row.rawDecimalBytes[relativeOffset];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const values = [...counts].sort((a, b) => a[0] - b[0]);
  return {
    relativeOffset, relativeOffsetHex: hex(relativeOffset),
    min: values[0][0], max: values.at(-1)[0], uniqueCount: values.length,
    valuesAndCounts: values.map(([value, count]) => ({ value, hex: hex(value), count })),
  };
});

const selected = rows.slice(0, 3).map(row => ({
  ...row,
  bytes: row.rawDecimalBytes.map((value, relativeOffset) => ({
    relativeOffset, relativeOffsetHex: hex(relativeOffset), value, hex: hex(value),
    entryOffsetHex: hex(row.entryOffset + relativeOffset),
    containerOffsetHex: hex(row.containerOffset + relativeOffset),
  })),
  numericInterpretationCandidates: [
    { relativeOffsets: [13, 14], representation: 'uint16 little endian candidate', value: bytes.readUInt16LE(row.entryOffset + 13), meaning: 'unconfirmed' },
    { relativeOffsets: [23, 24], representation: 'uint16 little endian candidate', value: bytes.readUInt16LE(row.entryOffset + 23), meaning: 'unconfirmed' },
  ],
}));

const result = {
  method: 'Static raw bytes only. Candidate stride 32 is tested against name alignment and file length; runtime stride/field widths/meanings require independent executable-code evidence. No game or editor was executed.',
  source: {
    entryPath: path.relative(root, source), byteLength: bytes.length, sha256: sha256(bytes),
    containerPath: path.relative(root, container), containerSha256: sha256(containerBytes),
    containerEntryOffset, containerEntryOffsetHex: hex(containerEntryOffset),
    extractedBytesEqualCopiedContainerRange: true,
  },
  encoding: 'Node TextDecoder(euc-kr, fatal=true), WHATWG EUC-KR/CP949 mapping; readable names support this decoding but do not prove the original encoding.',
  candidateStride: stride,
  candidateRowCount: rows.length,
  observations: {
    firstThreeNames: selected.map(row => row.nameDecodedCp949),
    nameFirstNulMinimum: Math.min(...rows.map(row => row.nameFirstNulRelativeOffset)),
    nameFirstNulMaximum: Math.max(...rows.map(row => row.nameFirstNulRelativeOffset)),
    allNamePrefixesDecodeSuccessfully: true,
    rowsWithNonzeroBytesAfterFirstNulThrough12: rows.filter(row => row.postNulNonzeroThrough12.length).map(row => row.candidateIndex),
    invariantByteColumns: histograms.filter(column => column.uniqueCount === 1).map(column => ({ relativeOffset: column.relativeOffset, relativeOffsetHex: column.relativeOffsetHex, value: column.min })),
    offset31ExceptionsTo255: rows.filter(row => row.rawDecimalBytes[31] !== 255).map(row => ({ candidateIndex: row.candidateIndex, name: row.nameDecodedCp949, value: row.rawDecimalBytes[31] })),
    numericLookingColumns18Through22: histograms.slice(18, 23).map(({ relativeOffset, min, max }) => ({ relativeOffset, min, max })),
  },
  limitations: [
    'No ability, class, equipment, portrait, runtime ID, level, HP or MP meaning is assigned by raw byte inspection.',
    'A NUL followed by zeros does not establish the exact allocated name-buffer capacity.',
    'Rows include duplicate names and a row named 수정금지; 1024 physical candidate rows does not mean 1024 selectable officers.',
    'The two uint16 interpretations are illustrative width/endian hypotheses, not verified field declarations.',
    'No runtime mutation, save-file state, or scenario-specific overrides were observed.',
  ],
  selectedFirstThreeRows: selected,
  comparisonByByte: Array.from({ length: stride }, (_, relativeOffset) => ({
    relativeOffset, relativeOffsetHex: hex(relativeOffset),
    values: selected.map(row => ({ candidateIndex: row.candidateIndex, name: row.nameDecodedCp949, value: row.rawDecimalBytes[relativeOffset] })),
  })),
  allCandidateRows: rows,
  histogramsByByte: histograms,
};
fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, destination), rows: rows.length, sourceSha256: result.source.sha256, firstThreeNames: result.observations.firstThreeNames, bytesAfterNulExceptions: result.observations.rowsWithNonzeroBytesAfterFirstNulThrough12.length }));
