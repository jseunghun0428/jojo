import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const input = path.join(root, 'input/tool');
const output = path.join(root, 'output');
const b = fs.readFileSync(path.join(input, 'Data.e5'));
const star = fs.readFileSync(path.join(input, 'Star.e5'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const hex = value => `0x${value.toString(16).toUpperCase()}`;
const kr = new TextDecoder('euc-kr', { fatal: true });
if (b.subarray(0, 16).toString('ascii') !== 'Ls12            ') throw new Error('Unexpected Data.e5 header');
const firstDataOffset = b.readUInt32BE(0x118);
const count = (firstDataOffset - 0x114) / 12;
if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('Invalid table size');
const extracted = path.join(output, 'extracted/Data');
fs.mkdirSync(extracted, { recursive: true });
const entries = [];
let expectedOffset = firstDataOffset;
for (let i = 0; i < count; i++) {
  const at = 0x110 + i * 12;
  const storedBytes = b.readUInt32BE(at), decodedBytes = b.readUInt32BE(at + 4), offset = b.readUInt32BE(at + 8);
  if (offset !== expectedOffset || offset + storedBytes > b.length) throw new Error(`Invalid entry boundary: ${i}`);
  // This artifact takes the direct ReadFile branch in FUN_0041fc89.
  // Deliberately refuse compressed entries rather than silently copying them.
  if (storedBytes !== decodedBytes) throw new Error(`Compressed entry ${i}: not supported by this Data-only extractor`);
  const bytes = b.subarray(offset, offset + storedBytes);
  const filename = `entry-${String(i).padStart(2, '0')}.bin`;
  fs.writeFileSync(path.join(extracted, filename), bytes);
  entries.push({ index: i, tableFileOffset: hex(at), sourceFileOffset: hex(offset), storedBytes, decodedBytes, compression: 'none: storedBytes equals decodedBytes', sha256: hash(bytes), extractedFile: `output/extracted/Data/${filename}` });
  expectedOffset += storedBytes;
}
if (expectedOffset !== b.length) throw new Error('Unaccounted trailing Data.e5 bytes');
if (b.readUInt32BE(0x110 + count * 12) !== 0) throw new Error('Unexpected table trailer');
const itemEntry = entries[1];
if (itemEntry.decodedBytes !== 104 * 25) throw new Error('Unexpected base item data length');
const itemBytes = b.subarray(Number(itemEntry.sourceFileOffset), Number(itemEntry.sourceFileOffset) + itemEntry.decodedBytes);
function item(id, sourceFile, sourceOffset, bytes) {
  const nameArea = bytes.subarray(0, 15);
  const terminator = nameArea.indexOf(0);
  if (terminator < 0) throw new Error(`Missing item name terminator: ${id}`);
  return { id, name: kr.decode(nameArea.subarray(0, terminator)), sourceFile, sourceFileOffset: hex(sourceOffset), rawHex: bytes.toString('hex'), parameters15to24: Array.from(bytes.subarray(15)), fieldSemantics: 'unverified; byte 15..24 retained without assigning gameplay meanings' };
}
const items = [];
for (let i = 0; i < 104; i++) items.push(item(i, 'Data.e5', Number(itemEntry.sourceFileOffset) + i * 25, itemBytes.subarray(i * 25, (i + 1) * 25)));
for (let i = 0; i < 151; i++) items.push(item(i + 104, 'Star.e5', i * 25, star.subarray(i * 25, (i + 1) * 25)));
const separator = item(255, 'Star.e5', 151 * 25, star.subarray(151 * 25, 152 * 25));
if (separator.name !== '절취선') throw new Error('Unexpected final separator');
const result = {
  generatedAt: new Date().toISOString(),
  sourceSha256: hash(b),
  entryCount: count,
  tableOffset: '0x110',
  tableEntryBytes: 12,
  byteOrder: 'big-endian',
  tableTrailerBytes: 4,
  allEntriesContiguous: true,
  finalEntryEndsAtFileSize: true,
  entries,
  evidence: [
    { procedure: '0x41fc89', evidenceId: 'ev_261fa38b774487b8d99ebf5b8d4da6a53c39dccd96713744c6333b4a531d0be6', claim: '12-byte big-endian entries from 0x110; equal lengths take direct read branch' },
    { procedure: '0x4010b0', evidenceId: 'ev_ca1461546f6d3c36b103a40abb0db195255f912d717c4757ee90455cbc00c81f', claim: 'Data.e5 entry1 to 0x4A1140, Star.e5 to 0x4A1B68; initialization loop covers IDs0..254' },
    { procedure: '0x4837c2', evidenceId: 'ev_b5bbd800568893ceb7397d7f24da48ee7d2e77eb8d7ac738a6f4fab3c7e48039', claim: 'Assembly computes item address as 0x4A1140 + index*25; pseudocode omits this register result' },
    { procedure: '0x451313', evidenceId: 'ev_6e1092ece422a7e0d101c669ebdfce9274e4fef85c4960da61d36428824a39e9', claim: 'Reads 0xED8=3800 bytes of Star.e5, corresponding to 152 records including separator' },
  ],
  limitations: ['Extraction and layout are corroborated by static code and bytes; the game has not been run.', 'Item field gameplay meanings, runtime postprocessing, and every ID usage remain unverified.', 'Compressed containers are intentionally not supported by this extractor.'],
};
fs.writeFileSync(path.join(output, 'data-container.json'), JSON.stringify(result, null, 2));
fs.writeFileSync(path.join(output, 'items.json'), JSON.stringify({ source: result.evidence, recordBytes: 25, baseCount: 104, starItemCount: 151, totalNamedRows: items.length, separator, items, limitations: result.limitations }, null, 2));
fs.writeFileSync(path.join(output, 'item-names.tsv'), '\uFEFFid\tname\tsource\toffset\n' + items.map(i => `${i.id}\t${i.name}\t${i.sourceFile}\t${i.sourceFileOffset}`).join('\n') + '\n');
console.log(JSON.stringify({ entryCount: count, allEntriesUncompressed: true, contiguousBytesAccountedFor: b.length, items: items.length, examples: [items[0], items[103], items[104], items[200]], separator }, null, 2));
