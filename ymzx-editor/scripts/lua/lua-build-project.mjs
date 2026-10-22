import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadHelper, projectSources } from './lua-helper-runtime.mjs';
import { checkProject } from './lua-check-project.mjs';

// Reuse the locally installed helper's ZIP implementation; do not activate VS Code.
export async function buildProject(projectPath, extensionFile) {
  projectPath = fs.realpathSync(projectPath); extensionFile = fs.realpathSync(extensionFile);
  const check = checkProject(projectPath, extensionFile);
  if (!check.ok) throw new Error('Lua checks failed: ' + JSON.stringify(check.errors));
  const { archive: archiver, encrypted } = loadHelper(extensionFile);
  if (!archiver.isRegisteredFormat('zip-encrypted')) archiver.registerFormat('zip-encrypted', encrypted);
  const files = projectSources(projectPath);
  const dist = path.join(projectPath, 'dist'); fs.mkdirSync(dist, { recursive: true });
  const time = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(/[ :]/g, '-');
  const pack = path.join(dist, 'code_' + time + '-' + randomBytes(3).toString('hex') + '.zip');
  const password = randomBytes(24).toString('base64url');
  const output = fs.createWriteStream(pack, { flags: 'wx' });
  const zip = archiver.create('zip-encrypted', { zlib: { level: 9 }, encryptionMethod: 'zip20', password });
  const completed = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); zip.on('error', reject); zip.on('warning', reject); });
  zip.pipe(output);
  for (const file of files) zip.append(fs.readFileSync(file), { name: path.relative(projectPath, file).split(path.sep).join('/') });
  await zip.finalize(); await completed;
  const manifestPath = path.join(dist, 'play.json');
  if (fs.existsSync(manifestPath)) fs.copyFileSync(manifestPath, manifestPath + '.before-' + Date.now());
  fs.writeFileSync(manifestPath, JSON.stringify({ type: 'pack', pack, time, pwd: password }, null, 2));
  return { project: projectPath, pack, files: files.length, sha256: createHash('sha256').update(fs.readFileSync(pack)).digest('hex'), manifestPath, warnings: check.warnings };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await buildProject(process.argv[2], process.argv[3]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
