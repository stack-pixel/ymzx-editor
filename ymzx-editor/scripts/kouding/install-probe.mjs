import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { config, root, scriptsDir } from './kouding-read-bridge.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = path.join(root, '.local', 'probe-install.json');
const profile = JSON.parse(fs.readFileSync(path.join(scriptsDir, '../../references/kouding/compatibility.json'), 'utf8'));
export function checkCompatibility(webRoot) {
  if (!webRoot) throw new Error('Provide the editor web resource directory containing index.html');
  webRoot = path.resolve(webRoot);
  if (!fs.existsSync(path.join(webRoot, 'index.html'))) throw new Error('index.html is missing');
  for (const [relative, expected] of Object.entries(profile.files)) {
    const file = path.join(webRoot, relative);
    if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== expected) throw new Error('Unsupported frontend asset: ' + relative + '; adapter needs compatibility review');
  }
  return { compatible: true, webRoot, frontendBuild: profile.frontendBuild };
}
export function manageProbe(mode, suppliedRoot) {
  if (mode === 'check') return checkCompatibility(suppliedRoot || process.env.YMZX_WEB_ROOT);
  if (!['install', 'update', 'restore'].includes(mode)) throw new Error('Unknown installation action');
  const saved = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  const webRoot = path.resolve(suppliedRoot || process.env.YMZX_WEB_ROOT || (saved && path.dirname(saved.indexPath)) || '.');
  const indexPath = path.join(webRoot, 'index.html');
  const probePath = path.join(webRoot, 'codex-read-probe.js');
  if (mode !== 'restore') checkCompatibility(webRoot);
  if (mode !== 'install') {
    if (!saved || path.resolve(saved.indexPath) !== indexPath || path.resolve(saved.probePath) !== probePath) throw new Error('Installation manifest does not match target');
    if (hash(fs.readFileSync(indexPath)) !== saved.patchedHash || hash(fs.readFileSync(probePath)) !== saved.probeHash) throw new Error('Installed files changed; inspect before updating or restoring');
    if (mode === 'restore') {
      const original = fs.readFileSync(saved.backup);
      if (hash(original) !== saved.originalHash) throw new Error('Backup hash mismatch');
      fs.writeFileSync(indexPath, original);
      fs.unlinkSync(probePath);
      fs.renameSync(manifestPath, manifestPath + '.restored-' + Date.now());
      return { restored: true, pageReloadRequired: true };
    }
  } else if (saved || fs.existsSync(probePath)) {
    throw new Error('Existing installation found; reuse its state directory instead of replacing its token');
  }
  const settings = config();
  const code = 'window.__codexKoudingReadConfig=' + JSON.stringify({ port: settings.port, token: settings.token }) + ';\n' +
    fs.readFileSync(path.join(scriptsDir, 'kouding-editor-actions.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(scriptsDir, 'native-scene-actions.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(scriptsDir, 'kouding-browser-probe.js'), 'utf8');
  if (mode === 'update') {
    fs.copyFileSync(probePath, path.join(root, '.local', 'probe-before-update-' + Date.now() + '.js'));
    fs.writeFileSync(probePath, code);
    saved.probeHash = hash(code);
    fs.writeFileSync(manifestPath, JSON.stringify(saved, null, 2));
    return { updated: true, pageReloadRequired: true };
  }
  const original = fs.readFileSync(indexPath);
  const html = original.toString('utf8');
  if (!html.includes('</body>') || html.includes('codex-read-probe')) throw new Error('Unexpected index contents');
  const patched = html.replace('</body>', '<script src="./codex-read-probe.js"></script>\n</body>');
  const backup = path.join(root, '.local', 'index-original-' + hash(original) + '.html');
  fs.writeFileSync(backup, original, { flag: 'wx' });
  fs.writeFileSync(probePath, code, { flag: 'wx' });
  fs.writeFileSync(manifestPath, JSON.stringify({ indexPath, probePath, backup, originalHash: hash(original), patchedHash: hash(patched), probeHash: hash(code) }, null, 2));
  fs.writeFileSync(indexPath, patched);
  return { installed: true, webRoot, frontendBuild: profile.frontendBuild, pageReloadRequired: true };
}
