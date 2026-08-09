import assert from 'node:assert/strict';
import {
  isExplicitContinuation,
  renderSoilForInspector,
  renderSoilForModel,
  soilFreshness,
} from '../functions/context-soil-renderer.js';

const longSoil = {
  current_text: `当前沿着海岸日常继续。${'具体场景与照顾动作。'.repeat(260)}`,
  hand_seeds: Array.from({ length: 6 }, (_, index) => ({ name: `种子 ${index + 1}`, life_core: `生命核 ${index + 1}` })),
  do_not_repeat: '不要说明书式重复。'.repeat(60),
  pocket_candidates: [{ title: '只给 Inspector', life_core: '尚未确认' }],
  organized_through_turn_id: 'turn-4',
  source_turn_id: 'turn-4',
  revision: 8,
  updated_at: new Date().toISOString(),
};
const recent = ['turn-1', 'turn-2', 'turn-3', 'turn-4'].map((turn_id, index) => ({ role: index % 2 ? 'assistant' : 'user', content: '海岸日常', turn_id }));
const model = renderSoilForModel({ soil: longSoil, contextSurface: 'main_chat' }, {
  surface: 'main_chat', modeKey: 'normal_chat', budget: 1000,
  lastUser: '继续海岸日常', recentMessages: recent, latestTurnId: 'turn-4',
});
const full = renderSoilForInspector({ soil: longSoil, contextSurface: 'main_chat' }, { surface: 'main_chat' });
assert.ok(model.text.length <= 1000);
assert.match(model.text, /思维壤｜压缩版/);
assert.equal((model.text.match(/^- 种子/gm) || []).length, 3);
assert.doesNotMatch(model.text, /只给 Inspector/);
assert.match(full, /只给 Inspector/);
assert.ok(model.original_length > model.model_length);
assert.equal(model.traces[0].freshness, 'live');
assert.equal(isExplicitContinuation('我们继续刚刚那个场景'), true);

const mismatch = soilFreshness(longSoil, { surface: 'radio', contextSurface: 'main_chat' });
assert.equal(mismatch.freshness, 'archived');
assert.equal(mismatch.surface_match, false);
const stale = soilFreshness({ ...longSoil, organized_through_turn_id: 'turn-old', updated_at: '2025-01-01T00:00:00.000Z' }, {
  surface: 'main_chat', contextSurface: 'main_chat', lastUser: '完全无关的话题', recentMessages: recent, latestTurnId: 'turn-4',
});
assert.equal(stale.freshness, 'stale');

console.log('context-soil-renderer: ok');
