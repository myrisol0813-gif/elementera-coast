import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve(process.cwd(), 'tests/memory.test.mjs');
const source = await readFile(path, 'utf8');
const before = `const longTurns = Array.from({ length: 12 }, (_, index) => turn(
  \`long-soil-\${index}\`,
  \`第\${index}轮用户 \${'甲'.repeat(7200)}\${index === 11 ? ' 最新用户完整尾标' : ''}\`,
  \`第\${index}轮助手 \${'乙'.repeat(7200)}\${index === 11 ? ' 最新助手完整尾标' : ''}\`,
  \`2026-07-14T08:\${String(index).padStart(2, '0')}:00.000Z\`,
));`;
const after = `const longTurns = Array.from({ length: 12 }, (_, index) => {
  const id = \`long-soil-\${index}\`;
  const createdAt = \`2026-07-14T08:\${String(index).padStart(2, '0')}:00.000Z\`;
  return {
    id,
    user: {
      active: 0,
      variants: [{
        id: \`\${id}-user\`,
        content: \`第\${index}轮用户 \${'甲'.repeat(7200)}\${index === 11 ? ' 最新用户完整尾标' : ''}\`,
        created_at: createdAt,
      }],
    },
    assistant: {
      activeByUserVariant: { 0: 0 },
      variantsByUserVariant: { 0: [{
        id: \`\${id}-assistant\`,
        content: \`第\${index}轮助手 \${'乙'.repeat(7200)}\${index === 11 ? ' 最新助手完整尾标' : ''}\`,
        created_at: createdAt,
      }] },
    },
  };
});`;
if (!source.includes(before)) throw new Error('long soil prompt test block not found');
await writeFile(path, source.replace(before, after));
console.log('P0 soil no-fail relax long prompt test fixed.');
