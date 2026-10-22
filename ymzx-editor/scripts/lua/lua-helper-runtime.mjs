import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { createHash } from 'node:crypto';

const verifiedHash = '3dafc520ba662e1ca18a9f64c3b9e4b24e7aa3fdf1c7a3850497950ee8612794';
const cache = new Map();

// Load only parser/archive modules from the installed, fingerprinted helper.
// The VS Code activation module and the installed file remain untouched.
export function loadHelper(extensionFile) {
  const file = fs.realpathSync(extensionFile);
  const source = fs.readFileSync(file, 'utf8');
  if (createHash('sha256').update(source).digest('hex') !== verifiedHash) throw new Error('Unsupported helper bundle version');
  if (cache.has(file)) return cache.get(file);
  const marker = 'var n=r(4265);module.exports=n';
  if (source.split(marker).length !== 2) throw new Error('Helper module loader changed');
  const localModule = new Module(file);
  localModule.filename = file;
  localModule.paths = Module._nodeModulePaths(path.dirname(file));
  localModule._compile(source.replace(marker, 'module.exports={archive:r(9133),encrypted:r(4474),parser:r(141)}'), file);
  cache.set(file, localModule.exports);
  return localModule.exports;
}

export function projectSources(project) {
  const src = path.join(fs.realpathSync(project), 'src');
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not supported in source tree');
      if (entry.isDirectory()) return walk(file);
      if (!entry.isFile()) throw new Error('Unsupported source entry');
      return entry.name.endsWith('.lua') ? [file] : [];
    });
  }
  if (!fs.existsSync(path.join(src, 'GameEntry.lua'))) throw new Error('src/GameEntry.lua is required');
  return walk(src);
}
