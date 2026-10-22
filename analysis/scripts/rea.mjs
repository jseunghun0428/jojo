import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const temporary = path.join(root, 'tools/tmp');
fs.mkdirSync(temporary, { recursive: true });
export const reaEnvironment = {
  ...process.env,
  GHIDRA_INSTALL_DIR: path.join(root, 'tools/ghidra_12.1.4_PUBLIC'),
  JAVA_HOME: 'C:\\Program Files\\JetBrains\\IntelliJ IDEA Community Edition 2025.2.6.1\\jbr',
  REA_ANALYSIS_PROVIDER: 'ghidra',
  TEMP: temporary,
  TMP: temporary,
};
export const reaEntry = path.join(root, 'tools/rea/node_modules/rea-agents/scripts/rea.mjs');
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const child = spawn(process.execPath, [reaEntry, ...process.argv.slice(2)], { env: reaEnvironment, stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
