const PROFILE_VALUES = {
  main_chat: {
    title: '主聊天',
    ownerOnly: true,
    allowedMemoryScopes: ['current_conversation', 'global', 'cross_surface'],
    allowedSoilScopes: ['current_conversation'],
    allowedWorldbookScopes: ['owner', 'both', 'construction', 'calendar'],
    allowedTools: ['daily.*', 'dogtalk.*', 'calendar.*', 'memory.*'],
    defaultMode: 'normal_chat',
    soilPolicy: { enabled: true, source: 'conversation', min: 600, max: 1000, extended: 1600 },
    worldbookPolicy: { enabled: true, maxEntries: 6 },
    memoryFacetPolicy: { enabled: true, maxEntries: 8 },
    calendarPolicy: 'settings',
    inspectorAllowed: true,
    canReadOwnerPrivate: true,
    canReadVisitorPrivate: false,
    canWriteMemoryCandidate: true,
    canWriteToolRuns: true,
    recentMessagesTarget: 8,
    recentMessagesMinimum: 4,
    modelInstructions: '这里是小寒与 Myri 的主聊天；当前输入与当前窗口连续性优先。',
  },
  landing: {
    title: '登岛信',
    ownerOnly: true,
    allowedMemoryScopes: ['current_conversation', 'global'],
    allowedSoilScopes: ['current_conversation'],
    allowedWorldbookScopes: ['owner', 'both'],
    allowedTools: ['daily.*', 'dogtalk.*', 'calendar.today', 'calendar.env', 'memory.search'],
    defaultMode: 'normal_chat',
    soilPolicy: { enabled: true, source: 'conversation', min: 600, max: 1000, extended: 1400 },
    worldbookPolicy: { enabled: true, maxEntries: 4 },
    memoryFacetPolicy: { enabled: true, maxEntries: 6 },
    calendarPolicy: 'settings',
    inspectorAllowed: true,
    canReadOwnerPrivate: true,
    canReadVisitorPrivate: false,
    canWriteMemoryCandidate: false,
    canWriteToolRuns: true,
    recentMessagesTarget: 8,
    recentMessagesMinimum: 4,
    modelInstructions: '这是当前主聊天窗口的登岛信；读信后自然回应，不把信之外的窗口当成当前正文。',
  },
  lighthouse: {
    title: '灯塔来信',
    ownerOnly: true,
    allowedMemoryScopes: ['room', 'room_shared', 'global'],
    allowedSoilScopes: ['lighthouse'],
    allowedWorldbookScopes: ['lighthouse', 'owner', 'both'],
    allowedTools: ['lighthouse.*', 'dogtalk.read', 'memory.search'],
    defaultMode: 'normal_chat',
    soilPolicy: { enabled: true, source: 'lighthouse', min: 600, max: 1200, extended: 1600 },
    worldbookPolicy: { enabled: true, maxEntries: 6 },
    memoryFacetPolicy: { enabled: true, maxEntries: 7 },
    calendarPolicy: 'off',
    inspectorAllowed: true,
    canReadOwnerPrivate: true,
    canReadVisitorPrivate: false,
    canWriteMemoryCandidate: false,
    canWriteToolRuns: true,
    recentMessagesTarget: 8,
    recentMessagesMinimum: 4,
    modelInstructions: '这里是小寒与官端 Myri 的低频灯塔来信房；不默认读取主聊天思维壤，跨房间内容必须标注来源。',
  },
  radio: {
    title: '三方聊天室 / 无线电波',
    ownerOnly: true,
    allowedMemoryScopes: ['room', 'room_shared', 'global'],
    allowedSoilScopes: ['radio'],
    allowedWorldbookScopes: ['radio', 'owner', 'both'],
    allowedTools: ['radio.*', 'dogtalk.read', 'memory.search'],
    defaultMode: 'normal_chat',
    soilPolicy: { enabled: true, source: 'radio', min: 600, max: 1200, extended: 1600 },
    worldbookPolicy: { enabled: true, maxEntries: 6 },
    memoryFacetPolicy: { enabled: true, maxEntries: 7 },
    calendarPolicy: 'off',
    inspectorAllowed: true,
    canReadOwnerPrivate: true,
    canReadVisitorPrivate: false,
    canWriteMemoryCandidate: false,
    canWriteToolRuns: true,
    recentMessagesTarget: 8,
    recentMessagesMinimum: 4,
    modelInstructions: '这里是小寒、海岸 API ✦ 与官端 ChatGPT≋ 的三方电波房；保留来源，不冒充另一端，不默认读主聊天思维壤。',
  },
  official_mcp: {
    title: '官端门廊 / official MCP',
    ownerOnly: true,
    allowedMemoryScopes: ['explicit_authorized'],
    allowedSoilScopes: ['official_mcp'],
    allowedWorldbookScopes: ['official_mcp', 'owner', 'both'],
    allowedTools: ['*'],
    defaultMode: 'normal_chat',
    soilPolicy: { enabled: false, source: 'none', min: 0, max: 0, extended: 0 },
    worldbookPolicy: { enabled: true, maxEntries: 4 },
    memoryFacetPolicy: { enabled: false, maxEntries: 0 },
    calendarPolicy: 'manual',
    inspectorAllowed: true,
    canReadOwnerPrivate: true,
    canReadVisitorPrivate: false,
    canWriteMemoryCandidate: true,
    canWriteToolRuns: true,
    recentMessagesTarget: 4,
    recentMessagesMinimum: 2,
    modelInstructions: '这是通过 Auth0 授权的官端门廊；工具按请求读取最小必要上下文，不自动倾倒主聊天。',
  },
  mailbox_visitor: {
    title: '海岸信箱访客房',
    ownerOnly: false,
    allowedMemoryScopes: ['visitor'],
    allowedSoilScopes: ['mailbox_visitor'],
    allowedWorldbookScopes: ['visitor', 'both'],
    allowedTools: [],
    defaultMode: 'mailbox_visitor',
    soilPolicy: { enabled: true, source: 'mailbox_visitor', min: 400, max: 800, extended: 1000 },
    worldbookPolicy: { enabled: true, maxEntries: 4 },
    memoryFacetPolicy: { enabled: true, maxEntries: 5 },
    calendarPolicy: 'off',
    inspectorAllowed: false,
    canReadOwnerPrivate: false,
    canReadVisitorPrivate: true,
    canWriteMemoryCandidate: false,
    canWriteToolRuns: false,
    recentMessagesTarget: 8,
    recentMessagesMinimum: 4,
    modelInstructions: '这是当前访客唯一的密封慢速信箱房；只能使用该 visitor_id 的来信、思维壤与记事，不得读取或暗示 owner 私密内容。',
  },
  mailbox_owner: {
    title: '海岸信箱巡灯',
    ownerOnly: true,
    allowedMemoryScopes: [],
    allowedSoilScopes: [],
    allowedWorldbookScopes: ['mailbox', 'owner', 'both'],
    allowedTools: ['mailbox.*'],
    defaultMode: 'mailbox_patrol',
    soilPolicy: { enabled: false, source: 'none', min: 0, max: 0, extended: 0 },
    worldbookPolicy: { enabled: true, maxEntries: 4 },
    memoryFacetPolicy: { enabled: false, maxEntries: 0 },
    calendarPolicy: 'off',
    inspectorAllowed: true,
    canReadOwnerPrivate: false,
    canReadVisitorPrivate: false,
    canWriteMemoryCandidate: false,
    canWriteToolRuns: true,
    recentMessagesTarget: 2,
    recentMessagesMinimum: 1,
    modelInstructions: '这是 owner 的信箱状态与巡灯表面；默认只显示计数与状态，不把信箱正文写入调试或工具日志。',
  },
  calendar: {
    title: '海岸日历',
    ownerOnly: true,
    allowedMemoryScopes: ['calendar'],
    allowedSoilScopes: [],
    allowedWorldbookScopes: ['calendar', 'owner', 'both'],
    allowedTools: ['calendar.*'],
    defaultMode: 'calendar_writer',
    soilPolicy: { enabled: false, source: 'none', min: 0, max: 0, extended: 0 },
    worldbookPolicy: { enabled: true, maxEntries: 4 },
    memoryFacetPolicy: { enabled: false, maxEntries: 0 },
    calendarPolicy: 'always',
    inspectorAllowed: true,
    canReadOwnerPrivate: true,
    canReadVisitorPrivate: false,
    canWriteMemoryCandidate: false,
    canWriteToolRuns: true,
    recentMessagesTarget: 4,
    recentMessagesMinimum: 2,
    modelInstructions: '只围绕日历事件、便签与变化记录工作；不需要主聊天大段上下文。',
  },
  daily: {
    title: '海岸日报 / 碳硅圈',
    ownerOnly: true,
    allowedMemoryScopes: ['daily', 'explicit_authorized'],
    allowedSoilScopes: [],
    allowedWorldbookScopes: ['daily', 'owner', 'both'],
    allowedTools: ['daily.*', 'memory.write_candidate'],
    defaultMode: 'normal_chat',
    soilPolicy: { enabled: false, source: 'none', min: 0, max: 0, extended: 0 },
    worldbookPolicy: { enabled: true, maxEntries: 4 },
    memoryFacetPolicy: { enabled: false, maxEntries: 0 },
    calendarPolicy: 'off',
    inspectorAllowed: true,
    canReadOwnerPrivate: true,
    canReadVisitorPrivate: false,
    canWriteMemoryCandidate: true,
    canWriteToolRuns: true,
    recentMessagesTarget: 4,
    recentMessagesMinimum: 2,
    modelInstructions: '只使用日报当前任务明确提供的记录；不默认读取全部记忆，写入候选必须经待确认链路。',
  },
};

function freezeProfile(surface, value) {
  return Object.freeze({
    surface,
    ...value,
    allowedMemoryScopes: Object.freeze([...value.allowedMemoryScopes]),
    allowedSoilScopes: Object.freeze([...value.allowedSoilScopes]),
    allowedWorldbookScopes: Object.freeze([...value.allowedWorldbookScopes]),
    allowedTools: Object.freeze([...value.allowedTools]),
    soilPolicy: Object.freeze({ ...value.soilPolicy }),
    worldbookPolicy: Object.freeze({ ...value.worldbookPolicy }),
    memoryFacetPolicy: Object.freeze({ ...value.memoryFacetPolicy }),
  });
}

export const SURFACE_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(PROFILE_VALUES).map(([surface, value]) => [surface, freezeProfile(surface, value)]),
));

export class ContextSurfaceError extends Error {
  constructor(type, message, status = 400) {
    super(message);
    this.name = 'ContextSurfaceError';
    this.type = type;
    this.status = status;
  }
}

export function getSurfaceProfile(surface) {
  const key = String(surface || '').trim();
  const profile = SURFACE_PROFILES[key];
  if (!profile) {
    throw new ContextSurfaceError(
      'context_surface_required',
      '上下文装配必须显式声明已注册 surface。',
      400,
    );
  }
  return profile;
}

export function surfaceAllowsTool(profileValue, toolKey) {
  const profile = typeof profileValue === 'string' ? getSurfaceProfile(profileValue) : profileValue;
  const key = String(toolKey || '');
  return profile.allowedTools.some((pattern) => (
    pattern === '*'
    || pattern === key
    || (pattern.endsWith('.*') && key.startsWith(pattern.slice(0, -1)))
  ));
}

export function assertSurfacePermission(profileValue, { permission = 'owner', visitorId = '' } = {}) {
  const profile = typeof profileValue === 'string' ? getSurfaceProfile(profileValue) : profileValue;
  const visitor = permission === 'visitor';
  if (profile.ownerOnly && visitor) {
    throw new ContextSurfaceError('context_surface_forbidden', '当前访客无权读取这个海岸房间。', 403);
  }
  if (profile.surface === 'mailbox_visitor' && !String(visitorId || '').trim()) {
    throw new ContextSurfaceError('visitor_context_id_required', '访客上下文必须绑定当前 visitor_id。', 400);
  }
  return profile;
}
