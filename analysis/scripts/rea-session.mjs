import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { reaEnvironment, reaEntry } from './rea.mjs';
const root = path.resolve(import.meta.dirname, '..');
const outputName = process.argv[2] ?? 'rea';
if (!/^[A-Za-z0-9_.-]+$/.test(outputName)) throw new Error('Invalid output directory name');
const output = path.join(root, 'output', outputName);
fs.mkdirSync(output, { recursive: true });
const child = spawn(process.execPath, [reaEntry, 'mcp'], { env: reaEnvironment, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
const stderr = fs.createWriteStream(path.join(output, 'server.stderr.log'), { flags: 'a' });
child.stderr.pipe(stderr);
const pending = new Map();
let id = 0;
const rpc = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`RPC timeout: ${method}`)); }, 1200000);
  pending.set(requestId, { resolve, reject, timeout });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
});
const notify = (method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
readline.createInterface({ input: child.stdout }).on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { fs.appendFileSync(path.join(output, 'non-json.log'), line + '\n'); return; }
  if (message.id !== undefined && pending.has(message.id)) {
    const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
  } else if (message.method) fs.appendFileSync(path.join(output, 'notifications.jsonl'), JSON.stringify(message) + '\n');
});
child.on('exit', code => { for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error(`Server exited ${code}`)); } pending.clear(); });
const initialized = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'jojo-local-analysis', version: '1.0.0' } });
fs.writeFileSync(path.join(output, 'initialize.json'), JSON.stringify(initialized, null, 2));
notify('notifications/initialized');
const catalog = await rpc('tools/list');
fs.writeFileSync(path.join(output, 'tool-catalog.json'), JSON.stringify(catalog, null, 2));
console.log(JSON.stringify({ ready: true, toolCount: catalog.tools.length, catalog: path.join(output, 'tool-catalog.json') }));
let queue = Promise.resolve();
const commands = readline.createInterface({ input: process.stdin });
commands.on('line', line => {
  if (!line.trim()) return;
  queue = queue.then(async () => {
    const command = JSON.parse(line);
    if (command.stop) { child.stdin.end(); setTimeout(() => child.kill(), 5000).unref(); commands.close(); return; }
    if (!/^[A-Za-z0-9_.-]+$/.test(command.saveAs)) throw new Error('Invalid output filename');
    console.log(JSON.stringify({ started: command.name, saveAs: command.saveAs }));
    const result = await rpc('tools/call', { name: command.name, arguments: command.arguments ?? {} });
    fs.writeFileSync(path.join(output, command.saveAs + '.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ completed: command.name, saveAs: command.saveAs, isError: result.isError ?? false }));
  }).catch(error => { console.error(error.message); });
});
