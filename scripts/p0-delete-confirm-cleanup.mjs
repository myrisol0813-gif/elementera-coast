import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function patch(path, replacements) {
  const url = new URL(path, root);
  let source = await readFile(url, 'utf8');
  for (const [label, oldText, newText] of replacements) {
    const first = source.indexOf(oldText);
    if (first < 0) throw new Error(`missing patch target: ${path} :: ${label}`);
    if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`ambiguous patch target: ${path} :: ${label}`);
    source = `${source.slice(0, first)}${newText}${source.slice(first + oldText.length)}`;
  }
  await writeFile(url, source);
}

await patch('elementera-mcp/deploy-pages/public/app.js', [
  ['danger import',
    "import { confirmDanger, dangerConfirmationFor, runConfirmedDanger } from './core/danger.js';",
    "import { confirmDanger, dangerConfirmationFor } from './core/danger.js';"],
  ['danger invoke',
    `    const invoke = () => controller.handleAction(name, target, event);\n    if (danger) await runConfirmedDanger(invoke);\n    else await invoke();`,
    `    await controller.handleAction(name, target, event);`],
]);

await patch('elementera-mcp/deploy-pages/public/features/chat.js', [
  ['conversation native confirm',
    "    if (!confirm('删除这个窗口？其他窗口不会受到影响。')) return;\n",
    ''],
]);

await patch('elementera-mcp/deploy-pages/public/features/memory.js', [
  ['soil native confirm',
    `  async function clearSoil({ ask = true } = {}) {\n    if (ask && !confirm('清空当前思维壤？种子库、记忆库和聊天记录不会被删除。')) return false;`,
    `  async function clearSoil() {`],
  ['entry native confirm',
    "      if (!confirm('删除这条种子或记忆？这是软删除，不会物理清空 D1。')) return;\n",
    ''],
]);

await patch('elementera-mcp/deploy-pages/public/features/tools.js', [
  ['context native confirm',
    "      if (!confirm('确定清空 API 临时上下文吗？这不会清空现有聊天记录。')) return;\n",
    ''],
]);

await patch('elementera-mcp/deploy-pages/public/core/danger.js', [
  ['legacy bypass helper',
    `\nexport function runConfirmedDanger(action) {\n  const previousConfirm = globalThis.confirm;\n  let bypassAvailable = true;\n  globalThis.confirm = (...args) => {\n    if (bypassAvailable) {\n      bypassAvailable = false;\n      return true;\n    }\n    return typeof previousConfirm === 'function' ? previousConfirm(...args) : false;\n  };\n  try {\n    return action();\n  } finally {\n    globalThis.confirm = previousConfirm;\n  }\n}\n`,
    '\n'],
]);

await patch('tests/danger.test.mjs', [
  ['legacy helper import',
    `  destructiveActions,\n  runConfirmedDanger,\n} from '../elementera-mcp/deploy-pages/public/core/danger.js';`,
    `  destructiveActions,\n} from '../elementera-mcp/deploy-pages/public/core/danger.js';`],
  ['legacy helper test',
    `\nconst previousConfirm = globalThis.confirm;\nglobalThis.confirm = () => { throw new Error('legacy native confirm leaked through the unified danger gate'); };\ntry {\n  const result = runConfirmedDanger(() => confirm('legacy confirm'));\n  assert.equal(result, true, 'already-confirmed destructive actions may pass their legacy native guard once');\n} finally {\n  globalThis.confirm = previousConfirm;\n}\n`,
    `\nfor (const file of sourceFiles) {\n  const source = await readFile(resolve(pages, file), 'utf8');\n  assert.equal(source.includes('confirm('), false, \\`${'${file}'} must not retain a browser-native confirm path\\`);\n}\n`],
]);

console.log('removed legacy native confirms; unified confirmDanger is the only destructive gate');
