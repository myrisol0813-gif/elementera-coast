import { listMysticDogtalkSnapshots } from './dogtalk-store.js';
import { listLighthouseLetters } from './lighthouse-store.js';
import { listRadioMessages } from './radio-store.js';

const MODEL_VISIBLE_READ_MODES = new Set(['read_now', 'current_room']);

function snapshotForAudience(snapshot, audience) {
  if (!snapshot) return {};
  if (audience !== 'model') {
    return {
      dogtalk_snapshot: {
        ...snapshot,
        selected_for_reply: snapshot.read_mode === 'read_now',
      },
    };
  }
  if (MODEL_VISIBLE_READ_MODES.has(snapshot.read_mode)) {
    return {
      dogtalk_snapshot: {
        ...snapshot,
        selected_for_reply: snapshot.read_mode === 'read_now',
      },
      dogtalk_available: true,
    };
  }
  if (snapshot.read_mode === 'when_confused') {
    return {
      dogtalk_available: true,
      dogtalk_read_mode: 'when_confused',
    };
  }
  return { dogtalk_available: false };
}

export async function attachDogtalkSnapshots(db, records, roomScope, { audience = 'owner' } = {}) {
  const snapshots = await listMysticDogtalkSnapshots(db, {
    room_scope: roomScope,
    source_ids: records.map((record) => record.id),
  });
  const bySource = new Map(snapshots.map((snapshot) => [snapshot.source_id, snapshot]));
  return records.map((record) => ({
    ...record,
    room_scope: roomScope,
    ...snapshotForAudience(bySource.get(record.id), audience),
  }));
}

export async function listRadioRoomMessages(db, options = {}, view = {}) {
  const records = await listRadioMessages(db, options);
  return attachDogtalkSnapshots(db, records, 'radio', view);
}

export async function listLighthouseRoomMessages(db, options = {}, view = {}) {
  const records = await listLighthouseLetters(db, options);
  return attachDogtalkSnapshots(db, records, 'lighthouse', view);
}
