import assert from 'node:assert/strict';
import {
  ContextSurfaceError,
  SURFACE_PROFILES,
  assertSurfacePermission,
  getSurfaceProfile,
} from '../functions/context-surfaces.js';

for (const surface of ['main_chat', 'lighthouse', 'radio', 'official_mcp', 'mailbox_visitor', 'mailbox_owner', 'calendar', 'daily']) {
  const profile = getSurfaceProfile(surface);
  assert.equal(profile.surface, surface);
  for (const field of [
    'ownerOnly', 'allowedMemoryScopes', 'allowedSoilScopes', 'allowedWorldbookScopes',
    'allowedTools', 'defaultMode', 'soilPolicy', 'worldbookPolicy', 'memoryFacetPolicy',
    'calendarPolicy', 'inspectorAllowed', 'canReadOwnerPrivate', 'canReadVisitorPrivate',
    'canWriteMemoryCandidate', 'canWriteToolRuns',
  ]) assert.ok(field in profile, `${surface} is missing ${field}`);
}
assert.equal(SURFACE_PROFILES.mailbox_visitor.canReadOwnerPrivate, false);
assert.equal(SURFACE_PROFILES.mailbox_visitor.inspectorAllowed, false);
assert.equal(SURFACE_PROFILES.lighthouse.allowedSoilScopes.includes('current_conversation'), false);
assert.equal(SURFACE_PROFILES.radio.allowedSoilScopes.includes('current_conversation'), false);
assert.throws(() => getSurfaceProfile(), ContextSurfaceError);
assert.throws(
  () => assertSurfacePermission('main_chat', { permission: 'visitor' }),
  (error) => error.type === 'context_surface_forbidden',
);

console.log('context-surfaces: ok');
