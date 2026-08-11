const VALUES = {
  main_chat: {
    ownerOnly: true,
    soil: 'conversation',
    memory: 'conversation_and_global',
    worldbook: ['owner', 'both', 'calendar'],
    tools: ['daily.*', 'dogtalk.*', 'calendar.*', 'memory.*'],
    recentMessages: 8,
    crossWindow: true,
    todayCoast: true,
  },
  landing: {
    ownerOnly: true,
    soil: 'conversation',
    memory: 'conversation_and_global',
    worldbook: ['owner', 'both'],
    tools: ['daily.*', 'dogtalk.*', 'calendar.today', 'calendar.env', 'memory.search'],
    recentMessages: 8,
    crossWindow: true,
    todayCoast: true,
  },
  radio: {
    ownerOnly: true,
    soil: 'radio',
    memory: 'radio_and_global',
    worldbook: ['radio', 'owner', 'both'],
    tools: ['radio.*', 'dogtalk.read', 'memory.search'],
    recentMessages: 8,
    crossWindow: false,
    todayCoast: false,
  },
  lighthouse: {
    ownerOnly: true,
    soil: 'lighthouse',
    memory: 'lighthouse_and_global',
    worldbook: ['lighthouse', 'owner', 'both'],
    tools: ['lighthouse.*', 'dogtalk.read', 'memory.search'],
    recentMessages: 8,
    crossWindow: false,
    todayCoast: false,
  },
  official_mcp: {
    ownerOnly: true,
    soil: 'none',
    memory: 'explicit_only',
    worldbook: ['official_mcp', 'owner', 'both'],
    tools: ['*'],
    recentMessages: 4,
    crossWindow: false,
    todayCoast: true,
  },
  mailbox_visitor: {
    ownerOnly: false,
    visitorBound: true,
    soil: 'mailbox_visitor',
    memory: 'visitor_only',
    worldbook: ['visitor', 'both'],
    tools: [],
    recentMessages: 8,
    crossWindow: false,
    todayCoast: false,
  },
  mailbox_owner: {
    ownerOnly: true,
    soil: 'none',
    memory: 'none',
    worldbook: ['mailbox', 'owner', 'both'],
    tools: ['mailbox.*'],
    recentMessages: 2,
    crossWindow: false,
    todayCoast: false,
  },
  calendar: {
    ownerOnly: true,
    soil: 'none',
    memory: 'none',
    worldbook: ['calendar', 'owner', 'both'],
    tools: ['calendar.*'],
    recentMessages: 4,
    crossWindow: false,
    todayCoast: true,
  },
  daily: {
    ownerOnly: true,
    soil: 'none',
    memory: 'none',
    worldbook: ['daily', 'owner', 'both'],
    tools: ['daily.*', 'memory.write_candidate'],
    recentMessages: 4,
    crossWindow: false,
    todayCoast: true,
  },
};

function frozen(surface, value) {
  return Object.freeze({
    surface,
    ...value,
    worldbook: Object.freeze([...value.worldbook]),
    tools: Object.freeze([...value.tools]),
  });
}

export const SURFACE_ACCESS_RULES = Object.freeze(Object.fromEntries(
  Object.entries(VALUES).map(([surface, value]) => [surface, frozen(surface, value)]),
));

export class RoomAccessError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'RoomAccessError';
    this.type = type;
    this.status = status;
  }
}

export function roomAccess(surface, { permission = 'owner', visitorId = '' } = {}) {
  const key = String(surface || '').trim();
  const access = SURFACE_ACCESS_RULES[key];
  if (!access) throw new RoomAccessError('surface_required', '请求必须明确指定一个海岸房间。');
  if (access.ownerOnly && permission !== 'owner') {
    throw new RoomAccessError('surface_forbidden', '当前访客无权读取这个海岸房间。', 403);
  }
  if (access.visitorBound && !String(visitorId || '').trim()) {
    throw new RoomAccessError('visitor_id_required', '访客房间必须绑定当前 visitor_id。');
  }
  return access;
}

export function roomAllowsTool(accessValue, toolKey) {
  const access = typeof accessValue === 'string' ? roomAccess(accessValue) : accessValue;
  const key = String(toolKey || '');
  return access.tools.some((pattern) => pattern === '*'
    || pattern === key
    || (pattern.endsWith('.*') && key.startsWith(pattern.slice(0, -1))));
}
