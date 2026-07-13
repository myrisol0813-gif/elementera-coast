import { clamp, id, sanitizeId } from '../core/dom.js';

const MAX_CONTENT = 12000;
const MAX_TURNS = 100;
const MAX_VARIANTS = 20;

const now = () => new Date().toISOString();

export function normalizeVariant(value = {}, prefix = 'variant') {
  if (typeof value.content !== 'string') return null;
  const errorDetail = String(value.errorDetail || '').trim().slice(0, MAX_CONTENT);
  return {
    id: sanitizeId(value.id || id(prefix), prefix),
    content: value.content.slice(0, MAX_CONTENT),
    created_at: typeof value.created_at === 'string' ? value.created_at : now(),
    liked: Boolean(value.liked),
    favorite: Boolean(value.favorite),
    ...(value.hidden === true ? { hidden: true } : {}),
    ...(value.input_type === 'landing_letter' ? { input_type: 'landing_letter' } : {}),
    ...(errorDetail ? { errorDetail } : {}),
  };
}

export function normalizeTurn(value = {}) {
  const userVariants = (Array.isArray(value?.user?.variants) ? value.user.variants : [])
    .map((variant) => normalizeVariant(variant, 'user'))
    .filter(Boolean)
    .slice(0, MAX_VARIANTS);
  const branches = {};
  const active = {};
  for (let index = 0; index < Math.max(1, userVariants.length); index += 1) {
    const key = String(index);
    branches[key] = (Array.isArray(value?.assistant?.variantsByUserVariant?.[key])
      ? value.assistant.variantsByUserVariant[key]
      : [])
      .map((variant) => normalizeVariant(variant, 'assistant'))
      .filter(Boolean)
      .slice(0, MAX_VARIANTS);
    active[key] = clamp(value?.assistant?.activeByUserVariant?.[key], branches[key].length || 1);
  }
  const turnType = value.turn_type === 'landing' ? 'landing' : '';
  return {
    id: sanitizeId(value.id || id('turn'), 'turn'),
    ...(turnType ? { turn_type: turnType, model_id: String(value.model_id || '').slice(0, 180) } : {}),
    user: {
      active: clamp(value?.user?.active, userVariants.length || 1),
      variants: userVariants,
    },
    assistant: {
      activeByUserVariant: active,
      variantsByUserVariant: branches,
    },
  };
}

export function normalizeState(value = {}) {
  const raw = value?.history || value || {};
  return {
    version: 4,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : now(),
    turns: (Array.isArray(raw.turns) ? raw.turns : [])
      .map(normalizeTurn)
      .filter((turn) => turn.user.variants.length || Object.values(turn.assistant.variantsByUserVariant).some((list) => list.length))
      .slice(-MAX_TURNS),
  };
}

export function createState() {
  return normalizeState();
}

export function activeBranch(turn) {
  const userIndex = clamp(turn?.user?.active, turn?.user?.variants?.length || 1);
  const key = String(userIndex);
  const assistants = turn?.assistant?.variantsByUserVariant?.[key] || [];
  const assistantIndex = clamp(turn?.assistant?.activeByUserVariant?.[key], assistants.length || 1);
  return {
    userIndex,
    key,
    user: turn?.user?.variants?.[userIndex] || null,
    assistants,
    assistantIndex,
    assistant: assistants[assistantIndex] || null,
  };
}

export function activeMessages(value) {
  const result = [];
  for (const turn of normalizeState(value).turns) {
    const branch = activeBranch(turn);
    if (branch.user?.content) result.push({ role: 'user', ...branch.user });
    if (branch.assistant?.content) result.push({ role: 'assistant', ...branch.assistant });
  }
  return result;
}

export function appendTurn(value, content) {
  const state = normalizeState(value);
  const turn = normalizeTurn({
    user: { active: 0, variants: [{ content: String(content || '').trim() }] },
    assistant: { activeByUserVariant: { 0: 0 }, variantsByUserVariant: { 0: [] } },
  });
  state.turns.push(turn);
  state.turns = state.turns.slice(-MAX_TURNS);
  state.updated_at = now();
  return { state, turn };
}

export function editUserVariant(value, turnId, content) {
  const state = normalizeState(value);
  const turn = state.turns.find((item) => item.id === turnId);
  if (!turn) return { state, turn: null };
  const variant = normalizeVariant({ content: String(content ?? '') }, 'user');
  turn.user.variants.push(variant);
  turn.user.variants = turn.user.variants.slice(-MAX_VARIANTS);
  const userIndex = turn.user.variants.length - 1;
  turn.user.active = userIndex;
  turn.assistant.variantsByUserVariant[String(userIndex)] = [];
  turn.assistant.activeByUserVariant[String(userIndex)] = 0;
  state.updated_at = now();
  return { state, turn };
}

export function deleteActiveUserVariant(value, turnId) {
  const state = normalizeState(value);
  const turnIndex = state.turns.findIndex((item) => item.id === turnId);
  const turn = state.turns[turnIndex];
  if (!turn) return state;
  const removedIndex = clamp(turn.user.active, turn.user.variants.length || 1);
  turn.user.variants.splice(removedIndex, 1);
  if (!turn.user.variants.length) {
    state.turns.splice(turnIndex, 1);
    state.updated_at = now();
    return state;
  }

  const branches = {};
  const active = {};
  for (let index = 0; index < turn.user.variants.length; index += 1) {
    const oldIndex = index >= removedIndex ? index + 1 : index;
    const list = turn.assistant.variantsByUserVariant[String(oldIndex)] || [];
    branches[String(index)] = list;
    active[String(index)] = clamp(turn.assistant.activeByUserVariant[String(oldIndex)], list.length || 1);
  }
  turn.user.active = Math.min(removedIndex, turn.user.variants.length - 1);
  turn.assistant.variantsByUserVariant = branches;
  turn.assistant.activeByUserVariant = active;
  state.updated_at = now();
  return state;
}

export function appendAssistantVariant(value, turnId, variantValue) {
  const state = normalizeState(value);
  const turn = state.turns.find((item) => item.id === turnId);
  if (!turn) return { state, turn: null, variant: null, assistantIndex: -1, userIndex: -1 };
  const branch = activeBranch(turn);
  const variant = normalizeVariant(variantValue, 'assistant');
  const list = turn.assistant.variantsByUserVariant[branch.key] || [];
  list.push(variant);
  turn.assistant.variantsByUserVariant[branch.key] = list.slice(-MAX_VARIANTS);
  const assistantIndex = turn.assistant.variantsByUserVariant[branch.key].length - 1;
  turn.assistant.activeByUserVariant[branch.key] = assistantIndex;
  state.updated_at = now();
  return { state, turn, variant, assistantIndex, userIndex: branch.userIndex };
}

export function updateAssistantVariant(value, turnId, userIndex, assistantIndex, patch) {
  const state = normalizeState(value);
  const turn = state.turns.find((item) => item.id === turnId);
  const variant = turn?.assistant?.variantsByUserVariant?.[String(userIndex)]?.[assistantIndex];
  if (!variant) return state;
  if (typeof patch.content === 'string') variant.content = patch.content.slice(0, MAX_CONTENT);
  if ('errorDetail' in patch) {
    const errorDetail = String(patch.errorDetail || '').trim().slice(0, MAX_CONTENT);
    if (errorDetail) variant.errorDetail = errorDetail;
    else delete variant.errorDetail;
  }
  if ('liked' in patch) variant.liked = Boolean(patch.liked);
  if ('favorite' in patch) variant.favorite = Boolean(patch.favorite);
  state.updated_at = now();
  return state;
}

export function deleteActiveAssistantVariant(value, turnId) {
  const state = normalizeState(value);
  const turn = state.turns.find((item) => item.id === turnId);
  if (!turn) return state;
  const branch = activeBranch(turn);
  if (!branch.assistants.length) return state;
  branch.assistants.splice(branch.assistantIndex, 1);
  turn.assistant.activeByUserVariant[branch.key] = Math.min(branch.assistantIndex, Math.max(0, branch.assistants.length - 1));
  state.updated_at = now();
  return state;
}

export function switchVariant(value, turnId, kind, direction) {
  const state = normalizeState(value);
  const turn = state.turns.find((item) => item.id === turnId);
  if (!turn) return state;
  const delta = direction === 'next' ? 1 : -1;
  if (kind === 'user' && turn.user.variants.length > 1) {
    turn.user.active = (turn.user.active + delta + turn.user.variants.length) % turn.user.variants.length;
  }
  if (kind === 'assistant') {
    const branch = activeBranch(turn);
    if (branch.assistants.length > 1) {
      turn.assistant.activeByUserVariant[branch.key] = (branch.assistantIndex + delta + branch.assistants.length) % branch.assistants.length;
    }
  }
  state.updated_at = now();
  return state;
}

export function toggleAssistantReaction(value, turnId, reaction) {
  const state = normalizeState(value);
  const turn = state.turns.find((item) => item.id === turnId);
  if (!turn || !['liked', 'favorite'].includes(reaction)) return state;
  const branch = activeBranch(turn);
  if (!branch.assistant) return state;
  branch.assistant[reaction] = !branch.assistant[reaction];
  state.updated_at = now();
  return state;
}

export function flatMessagesToState(messages = []) {
  let state = createState();
  let turn = null;
  for (const message of Array.isArray(messages) ? messages.slice(-200) : []) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') continue;
    if (message.role === 'user') {
      const appended = appendTurn(state, message.content);
      state = appended.state;
      turn = appended.turn;
    } else if (turn) {
      state = appendAssistantVariant(state, turn.id, message).state;
    }
  }
  return normalizeState(state);
}
