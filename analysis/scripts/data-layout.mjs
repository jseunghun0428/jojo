// Static, read-only probes of the two copied .e5 files. Run from the project root.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const input = path.join(root, 'analysis', 'input', 'tool');
const output = path.join(root, 'analysis', 'output', 'data-layout.json');
const decoder = new TextDecoder('euc-kr', { fatal: true });
const hex = n => '0x' + n.toString(16).toUpperCase();
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const star = fs.readFileSync(path.join(input, 'Star.e5'));
const imsg = fs.readFileSync(path.join(input, 'imsg.e5'));

const starRows = Array.from({ length: 152 }, (_, index) => {
  const offset = index * 25;
  const bytes = star.subarray(offset, offset + 25);
  const nameEnd = bytes.indexOf(0);
  return {
    index, offset, offsetHex: hex(offset),
    nameCp949: decoder.decode(bytes.subarray(0, nameEnd)),
    nameByteLength: nameEnd,
    rawHex: bytes.toString('hex'),
    // The exact name-buffer capacity is not established by these bytes.
    fields15Through24: Array.from(bytes.subarray(15)),
  };
});
const uniqueValues = Array.from({ length: 25 }, (_, relativeOffset) => ({
  relativeOffset,
  values: [...new Set(starRows.slice(0,151).map(r => parseInt(r.rawHex.slice(relativeOffset*2,relativeOffset*2+2),16)))].sort((a,b)=>a-b),
}));
const imsgRows = Array.from({ length: imsg.length / 200 }, (_, index) => {
  const offset = index * 200;
  const bytes = imsg.subarray(offset, offset + 200);
  const nulOffset = bytes.indexOf(0);
  const trailingNonzero = [];
  for (let i = nulOffset + 1; i < bytes.length; i++) {
    if (bytes[i] !== 0) trailingNonzero.push({ relativeOffset: i, offset: offset + i, offsetHex: hex(offset+i), value: bytes[i] });
  }
  return {
    index, offset, offsetHex: hex(offset), nulRelativeOffset: nulOffset,
    textCp949: decoder.decode(bytes.subarray(0, nulOffset)),
    trailingNonzero,
  };
});

const result = {
  method: 'Static byte inspection only; no game/editor execution. Offsets are zero-based file offsets; range ends are exclusive.',
  encoding: {
    confirmed: 'All observed Star name prefixes and all 2250 imsg NUL-terminated strings decode using Node TextDecoder(euc-kr, fatal=true), which uses the WHATWG EUC-KR/CP949 mapping. Readable Korean item names and descriptions are present.',
    limitation: 'Successful decoding does not prove a single original encoding. Some placeholder strings decode to semantically garbled Korean/Chinese; original codepage and intended text are unconfirmed.',
  },
  star: {
    file: 'analysis/input/tool/Star.e5', size: star.length, sha256: digest(star),
    confirmed: [
      'Offsets i*25 for i=0..150 align 151 readable item/placeholder names followed by numeric bytes.',
      'Index151 at offset 3775 (0xEBF) contains the name 절취선 and zero-valued remaining bytes.',
      'Bytes 3800..4687 are all zero; bytes 4688..6342 are all 0x20; bytes 6343..6358 are all zero.',
      'The copied file contains named records after index95: index96 at 0x960 is 수류탄. SCount=96 must not be treated as the entire physical record count.',
      'Across the 151 item rows, name terminators are within relative byte2..11. Relative bytes11..14 are all zero; bytes15 and16 vary for some rows.',
    ],
    fieldCandidates: [
      { relativeOffset: '0..14', status: 'candidate', description: 'NUL-terminated name plus padding. Exact allocated name-buffer length is unknown; do not assume all 15 bytes are text.' },
      { relativeOffset: 15, status: 'unconfirmed semantics', description: 'Values 0 or1. Index101 탐지기 and indices102..103 have 1; cannot be name padding in all rows.' },
      { relativeOffset: 16, status: 'candidate subtype/parameter', description: 'Mine groups at indices104..109 /110..115 /116..121 use 0 /1 /2 respectively; bomb rows96..100 vary.' },
      { relativeOffset: 17, status: 'candidate effect/type code', description: 'All named mine rows104..121 have 0x40; thrown bombs96..100 have0x41; exact behavior not established.' },
      { relativeOffset: 18, status: 'candidate category', description: 'Rows5..45 (accessory/equipment names) all have2; rows46..150 (consumables/bombs/placeholders) all have3. First5 rows differ.' },
      { relativeOffset: '19..24', status: 'unconfirmed semantics', description: 'Numeric parameters, IDs or flags. Preserve raw bytes; no widths, signedness, or gameplay meaning established.' },
    ],
    inferred: [ 'The 25-byte pattern is a strong fixed-record layout hypothesis for the named prefix. Runtime loader verification is still needed.', '절취선 may mark a logical end/separator; trailing fill is not a validated record table.' ],
    unknown: [ 'Which records this executable actually uses', 'Why the file begins with 방어공란12', 'Meaning of SCount and whether it limits one category', 'Exact field widths, signedness, and meanings' ],
    uniqueValuesByRelativeByte: uniqueValues,
    rows: starRows,
  },
  imsg: {
    file: 'analysis/input/tool/imsg.e5', size: imsg.length, sha256: digest(imsg),
    candidateStride: 200, slotCount: imsgRows.length,
    confirmed: [
      'File size is exactly 200*2250=450000. Every slot at i*200 contains a NUL within its200 bytes.',
      'The first slot at0x0 contains a readable Korean fire-attack description; slot1 at0xC8 contains the next description.',
      'Maximum first-NUL relative offset is199. Six slots contain nonzero bytes after their first NUL:107,117,127,172,228,623; these must be preserved by any future writer.',
      'Text includes skill descriptions, battle names, biographies and class names; no game-code index-to-category mapping has been verified.',
    ],
    inferred: [ 'The complete file is strongly consistent with a200-byte fixed text-slot table, with no separate header.', 'Most slots use NUL padding; exceptional trailing bytes could be leftover editor data or metadata, which remains unconfirmed.' ],
    unknown: [ 'Runtime lookup formula and category base indices', 'Original codepage of garbled placeholders', 'Whether post-NUL exceptions have functional meaning' ],
    exceptions: imsgRows.filter(r => r.trailingNonzero.length).map(({index,offsetHex,trailingNonzero})=>({index,offsetHex,trailingNonzero})),
    rows: imsgRows,
  },
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ output, starNamedItemRows: 151, starSeparatorOffset: hex(151*25), imsgSlots: imsgRows.length, imsgPostNulExceptions: result.imsg.exceptions.map(r=>r.index) }));
