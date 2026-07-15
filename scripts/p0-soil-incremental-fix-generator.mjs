// retrigger 3
import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/p0-soil-incremental-bridge.mjs';
let text = await readFile(path, 'utf8');
text = text.replace(/id: \\\`\$\{id\}-user\\\`/g, "id: id + '-user'");
text = text.replace(/id: \\\`\$\{id\}-assistant\\\`/g, "id: id + '-assistant'");
text = text.replace(/\\\`unexpected fetch: \\\${url}\\\`/g, "'unexpected fetch: ' + url");
text = text.replace(/\\\`visible-\\\${index}\\\`/g, "'visible-' + index");
text = text.replace(/\\\`第\\\${index}轮用户 \\\${index === 98 \? 'previous-visible-marker ' : ''}\\\${index === 99 \? 'latest-visible-user-marker ' : ''}\\\${'甲'\.repeat\(1800\)}\\\`/g, "'第' + index + '轮用户 ' + (index === 98 ? 'previous-visible-marker ' : '') + (index === 99 ? 'latest-visible-user-marker ' : '') + '甲'.repeat(1800)");
text = text.replace(/\\\`第\\\${index}轮助手 \\\${index === 98 \? 'previous-visible-assistant-marker ' : ''}\\\${index === 99 \? 'latest-visible-assistant-marker ' : ''}\\\${'乙'\.repeat\(1800\)}\\\`/g, "'第' + index + '轮助手 ' + (index === 98 ? 'previous-visible-assistant-marker ' : '') + (index === 99 ? 'latest-visible-assistant-marker ' : '') + '乙'.repeat(1800)");
text = text.replace(/\\\`2026-07-15T02:\\\${String\(index\)\.padStart\(2, '0'\)}:00\.000Z\\\`/g, "'2026-07-15T02:' + String(index).padStart(2, '0') + ':00.000Z'");
await writeFile(path, text);
