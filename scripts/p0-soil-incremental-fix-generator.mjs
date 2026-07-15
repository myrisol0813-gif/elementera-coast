// retrigger 2
import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/p0-soil-incremental-bridge.mjs';
let text = await readFile(path, 'utf8');
text = text.replaceAll("id: \`${id}-user\`", "id: id + '-user'");
text = text.replaceAll("id: \`${id}-assistant\`", "id: id + '-assistant'");
text = text.replaceAll("\`unexpected fetch: \${url}\`", "'unexpected fetch: ' + url");
text = text.replaceAll("\`visible-\${index}\`", "'visible-' + index");
text = text.replaceAll("\`第\${index}轮用户 \${index === 98 ? 'previous-visible-marker ' : ''}\${index === 99 ? 'latest-visible-user-marker ' : ''}\${'甲'.repeat(1800)}\`", "'第' + index + '轮用户 ' + (index === 98 ? 'previous-visible-marker ' : '') + (index === 99 ? 'latest-visible-user-marker ' : '') + '甲'.repeat(1800)");
text = text.replaceAll("\`第\${index}轮助手 \${index === 98 ? 'previous-visible-assistant-marker ' : ''}\${index === 99 ? 'latest-visible-assistant-marker ' : ''}\${'乙'.repeat(1800)}\`", "'第' + index + '轮助手 ' + (index === 98 ? 'previous-visible-assistant-marker ' : '') + (index === 99 ? 'latest-visible-assistant-marker ' : '') + '乙'.repeat(1800)");
text = text.replaceAll("\`2026-07-15T02:\${String(index).padStart(2, '0')}:00.000Z\`", "'2026-07-15T02:' + String(index).padStart(2, '0') + ':00.000Z'");
await writeFile(path, text);
