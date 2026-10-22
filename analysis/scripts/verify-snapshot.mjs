import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'output/snapshot-manifest.json'), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const failures = [];
let totalBytes = 0;
for (const entry of manifest.entries) {
  for (const [role, base] of [['source', manifest.source], ['copy', manifest.destination]]) {
    const file = path.join(base, entry.path);
    if (!fs.existsSync(file)) failures.push({ role, path: entry.path, issue: 'missing' });
    else if (fs.statSync(file).size !== entry.size || hash(file) !== entry.sha256) failures.push({ role, path: entry.path, issue: 'changed' });
  }
  totalBytes += entry.size;
}
const result = { checkedAt: new Date().toISOString(), fileCount: manifest.entries.length, totalBytes, sourceUnchanged: !failures.some(f => f.role === 'source'), copyUnchanged: !failures.some(f => f.role === 'copy'), failures };
fs.writeFileSync(path.join(root, 'output/integrity-check.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
process.exitCode = failures.length ? 1 : 0;
