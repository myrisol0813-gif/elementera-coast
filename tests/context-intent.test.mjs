import assert from 'node:assert/strict';
import { buildIntentSummary, intentRawExcerpt } from '../functions/context-intent.js';

const raw = `To OpenAI gpt-5.5\n\`\`\`json\n{"manifest":"${'原文'.repeat(160)}"}\n\`\`\`\nOMG 我发现这个系统是不是还没同步到所有聊天框，请检查灯塔和无线电波。`;
const summary = buildIntentSummary({ surface: 'main_chat', mode: { mode_key: 'construction_review' }, lastUser: raw });
assert.ok(summary.length >= 60 && summary.length <= 140);
assert.match(summary, /上下文底座|代码排查/);
assert.doesNotMatch(summary, /To OpenAI|gpt-5\.5|manifest|OMG/);
assert.equal(summary.includes(raw.slice(-30)), false, 'intent is a summary rather than copied raw input');
assert.doesNotMatch(intentRawExcerpt(raw), /To OpenAI|```|manifest/);

const mailbox = buildIntentSummary({ surface: 'mailbox_visitor', mode: 'mailbox_visitor', lastUser: '想继续写一封信箱来信。' });
assert.match(mailbox, /当前访客|owner/);

console.log('context-intent: ok');
