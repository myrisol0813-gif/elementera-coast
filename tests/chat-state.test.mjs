import assert from 'node:assert/strict';
import {
  activeBranch,
  appendAssistantVariant,
  appendTurn,
  createState,
  deleteActiveAssistantVariant,
  deleteActiveUserVariant,
  editUserVariant,
  switchVariant,
  toggleAssistantReaction,
} from '../elementera-mcp/deploy-pages/public/features/chat-state.js';

let state = createState();
let result = appendTurn(state, 'a1');
state = result.state;
const turnId = result.turn.id;
state = appendAssistantVariant(state, turnId, { content: 'answer-a1-1' }).state;
state = appendAssistantVariant(state, turnId, { content: 'answer-a1-2' }).state;
assert.equal(activeBranch(state.turns[0]).assistant.content, 'answer-a1-2');

state = switchVariant(state, turnId, 'assistant', 'previous');
assert.equal(activeBranch(state.turns[0]).assistant.content, 'answer-a1-1');
state = toggleAssistantReaction(state, turnId, 'liked');
state = toggleAssistantReaction(state, turnId, 'favorite');
assert.equal(activeBranch(state.turns[0]).assistant.liked, true);
assert.equal(activeBranch(state.turns[0]).assistant.favorite, true);

result = editUserVariant(state, turnId, 'a1 edited');
state = result.state;
state = appendAssistantVariant(state, turnId, { content: 'answer-edited' }).state;
assert.equal(state.turns[0].user.variants.length, 2);
assert.equal(activeBranch(state.turns[0]).assistant.content, 'answer-edited');

state = switchVariant(state, turnId, 'user', 'previous');
assert.equal(activeBranch(state.turns[0]).user.content, 'a1');
assert.equal(activeBranch(state.turns[0]).assistants.length, 2);

state = deleteActiveAssistantVariant(state, turnId);
assert.equal(activeBranch(state.turns[0]).assistants.length, 1);
assert.equal(activeBranch(state.turns[0]).assistant.content, 'answer-a1-2');

state = deleteActiveUserVariant(state, turnId);
assert.equal(state.turns[0].user.variants.length, 1);
assert.equal(activeBranch(state.turns[0]).user.content, 'a1 edited');
assert.equal(activeBranch(state.turns[0]).assistant.content, 'answer-edited');

state = deleteActiveUserVariant(state, turnId);
assert.equal(state.turns.length, 0);

console.log('chat-state: ok');

