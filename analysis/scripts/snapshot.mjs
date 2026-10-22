import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const source = path.join(root, 'tool');
const destination = path.join(root, 'analysis/input/tool');
const output = path.join(root, 'analysis/output');
if (fs.existsSync(destination)) throw new Error(`Snapshot already exists: ${destination}`);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.mkdirSync(output, { recursive: true });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const entries = [];
function copyDirectory(from, to) {
  fs.mkdirSync(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const original = path.join(from, entry.name);
    const copy = path.join(to, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${original}`);
    if (entry.isDirectory()) copyDirectory(original, copy);
    else if (entry.isFile()) {
      fs.copyFileSync(original, copy, fs.constants.COPYFILE_EXCL);
      const sourceHash = hash(original);
      const copyHash = hash(copy);
      if (sourceHash !== copyHash) throw new Error(`Hash mismatch: ${original}`);
      entries.push({ path: path.relative(source, original).replaceAll('\\', '/'), size: fs.statSync(original).size, sha256: sourceHash });
    } else throw new Error(`Unsupported file: ${original}`);
  }
}
copyDirectory(source, destination);
const manifest = { createdAt: new Date().toISOString(), source, destination, fileCount: entries.length, totalBytes: entries.reduce((n, f) => n + f.size, 0), entries };
fs.writeFileSync(path.join(output, 'snapshot-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ source, destination, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, allHashesMatch: true }));
