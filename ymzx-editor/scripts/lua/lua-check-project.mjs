import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadHelper, projectSources } from './lua-helper-runtime.mjs';

export function checkProject(project, extensionFile) {
  project = fs.realpathSync(project);
  const { parser } = loadHelper(extensionFile);
  const files = projectSources(project);
  const modules = new Set(files.flatMap(file => {
    const name = path.relative(path.join(project, 'src'), file).replace(/\.lua$/, '').split(path.sep).join('.');
    return name.endsWith('.init') ? [name, name.slice(0, -5)] : [name];
  }));
  const library = path.resolve(path.dirname(extensionFile), '../res/lib');
  const apiMethods = new Map();
  if (fs.existsSync(library)) for (const file of fs.readdirSync(library).filter(name => name.endsWith('.lua'))) {
    const text = fs.readFileSync(path.join(library, file), 'utf8');
    const aliases = new Map([...text.matchAll(/_G\.(\w+)\s*=\s*(\w+)/g)].map(match => [match[2], match[1]]));
    for (const match of text.matchAll(/function\s+(\w+)[:.](\w+)\s*\(/g)) {
      const name = aliases.get(match[1]) ?? match[1];
      if (!apiMethods.has(name)) apiMethods.set(name, new Set());
      apiMethods.get(name).add(match[2]);
    }
  }
  const errors = [], warnings = [], dependencies = [];
  const location = (file, node) => ({ file: path.relative(project, file).split(path.sep).join('/'), line: node.loc?.start.line, column: node.loc?.start.column });
  for (const file of files) {
    let ast;
    try { ast = parser.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), { locations: true, scope: true, comments: false }); }
    catch (error) { errors.push({ file: path.relative(project, file), kind: 'syntax', message: error.message, line: error.line, column: error.column }); continue; }
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (['CallExpression', 'StringCallExpression'].includes(node.type)) {
        if (node.base?.type === 'Identifier' && node.base.name === 'require' && !node.base.isLocal) {
          const argument = node.argument ?? node.arguments?.[0];
          if (argument?.type === 'StringLiteral') {
            dependencies.push({ ...location(file, node), module: argument.value });
            if (!modules.has(argument.value)) errors.push({ ...location(file, node), kind: 'missing_module', message: `Module not included in src: ${argument.value}` });
          } else warnings.push({ ...location(file, node), kind: 'dynamic_require', message: 'Dynamic require cannot be resolved statically' });
        }
        const base = node.base;
        if (base?.type === 'MemberExpression' && base.base?.type === 'Identifier' && !base.base.isLocal && apiMethods.has(base.base.name) && !apiMethods.get(base.base.name).has(base.identifier.name)) {
          warnings.push({ ...location(file, node), kind: 'unknown_api', message: `${base.base.name}:${base.identifier.name} is absent from installed API declarations` });
        }
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
    visit(ast);
  }
  return { ok: errors.length === 0, project, files: files.length, parserVersion: parser.version, apiClasses: apiMethods.size, errors, warnings, dependencies, limits: 'Static syntax/module checks only; API warnings use installed declarations. Runtime behavior, API arguments and client/server placement still require validation.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = checkProject(process.argv[2], process.argv[3]); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; }
  catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
}
