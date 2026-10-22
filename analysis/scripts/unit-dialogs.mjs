import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const b = fs.readFileSync(path.join(root, 'input/tool/Ekd5.exe'));
const pe = JSON.parse(fs.readFileSync(path.join(root, 'output/Ekd5.exe.pe.json'), 'utf8'));
const results = [];
for (const r of pe.resources.filter(r => r.path[0] === 5)) {
  const start = Number(r.offset), end = start + r.size;
  const body = b.subarray(start, end);
  if (!['무력', '병종'].some(t => body.includes(Buffer.from(t, 'utf16le')))) continue;
  let at = start;
  const ensure = n => { if (at + n > end) throw new Error(`Dialog truncated at ${at.toString(16)}`); };
  const u16 = () => { ensure(2); const v = b.readUInt16LE(at); at += 2; return v; };
  const i16 = () => { ensure(2); const v = b.readInt16LE(at); at += 2; return v; };
  const u32 = () => { ensure(4); const v = b.readUInt32LE(at); at += 4; return v; };
  const u8 = () => { ensure(1); return b[at++]; };
  function field() {
    const first = u16();
    if (first === 0) return '';
    if (first === 0xffff) return { ordinal: u16() };
    const units = [first];
    let v;
    while ((v = u16()) !== 0) units.push(v);
    return String.fromCharCode(...units);
  }
  const extended = b.readUInt16LE(at) === 1 && b.readUInt16LE(at + 2) === 0xffff;
  let style, exStyle, count;
  if (extended) { u16(); u16(); u32(); exStyle = u32(); style = u32(); count = u16(); }
  else { style = u32(); exStyle = u32(); count = u16(); }
  const coordinates = { x: i16(), y: i16(), width: i16(), height: i16() };
  const menu = field(), windowClass = field(), title = field();
  let font;
  if (style & 0x40) {
    font = { pointSize: u16() };
    if (extended) Object.assign(font, { weight: u16(), italic: u8(), charset: u8() });
    font.face = field();
  }
  const controls = [];
  for (let i = 0; i < count; i++) {
    at = (at + 3) & ~3;
    const controlOffset = at;
    let controlStyle, controlExStyle;
    if (extended) { u32(); controlExStyle = u32(); controlStyle = u32(); }
    else { controlStyle = u32(); controlExStyle = u32(); }
    const coordinates = { x: i16(), y: i16(), width: i16(), height: i16() };
    const id = extended ? u32() : u16();
    const controlClass = field(), text = field();
    const extraBytes = u16();
    if (extraBytes) { ensure(extraBytes); at += extraBytes; }
    controls.push({ id, idHex: `0x${id.toString(16)}`, text, class: controlClass, coordinates, sourceOffset: `0x${controlOffset.toString(16)}` });
  }
  results.push({ resource: r.path, offset: r.offset, extended, title, coordinates, font, menu, windowClass, style, exStyle, controls });
}
fs.writeFileSync(path.join(root, 'output/unit-dialogs.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(r => ({ resource: r.resource, title: r.title, controls: r.controls.map(c => ({ id: c.idHex, text: c.text, x: c.coordinates.x, y: c.coordinates.y })) })), null, 2));
