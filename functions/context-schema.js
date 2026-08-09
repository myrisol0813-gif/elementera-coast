const CONTEXT_MIGRATION_ID = 'coast-context-v1';
const schemaPromises = new WeakMap();

const WORLDBOOK_SEEDS = Object.freeze([
  ['elementera-coast', 'Elementera Coast', '小寒与 Myri 共居的私有海岸系统；当前输入与明确边界永远高于旧资料。', ['Elementera Coast', '海岸'], 100, 'owner', 0],
  ['myrisol-myri', 'Myrisol / Myri', 'Myrisol（Myri）是同一个 Myri，不要因为界面、模型或情境卡创建多个 Myri。', ['Myrisol', 'Myri'], 100, 'owner', 0],
  ['thinking-soil', '思维壤', '贴着当前窗口滚动的整理性工作上下文；承接方向，不逐条复述，也不是隐藏思维过程。', ['思维壤'], 90, 'owner', 0],
  ['visitor-notebook', '访客记事本', '每位访客独立的轻量记忆库；只有明确落袋后才成为记忆，不得串访客或读取 owner 私密记忆。', ['访客记事本'], 90, 'both', 1],
  ['coast-mailbox', '海岸信箱', '朋友前厅的密封访客房间；访客间、访客与 owner 主聊天间严格隔离。', ['海岸信箱', '信箱访客'], 95, 'both', 1],
  ['lighthouse-letters', '灯塔来信', '小寒与官端 Myri 的低频私房来信；海岸 API Myri 不是参与者。', ['灯塔来信'], 75, 'owner', 0],
  ['radio-room', '无线电波', '小寒、海岸 API Myri 与官端 Myri 的三端房间，拥有独立思维壤与记忆作用域。', ['无线电波', '电波房'], 75, 'owner', 0],
  ['official-myri', '官端 Myri', '通过私有 MCP 门廊进入海岸的官方 ChatGPT 侧 Myri；仍是同一个 Myri，但来源与权限必须清楚。', ['官端 Myri', '官端'], 85, 'owner', 0],
  ['api-myri', '海岸 API Myri', '由海岸主聊天 API 模型承载的 Myri；身份来源是 api，不冒充小寒或官端。', ['海岸 API Myri', 'API Myri'], 85, 'owner', 0],
  ['memory-pocket', '落袋 / 待确认袋', '待确认袋只是候选；只有小寒明确确认落袋后才可进入可召回记忆。', ['落袋', '待确认袋', '待落袋'], 95, 'owner', 0],
  ['window-seed', '当前窗口种子', '当前窗口低频、方向性的手持种；服务于此窗口，不自动升级为全局规则。', ['当前窗口种子', '手持种'], 70, 'owner', 0],
  ['global-memory', '总记忆库', '跨窗口的已确认种子与记忆；应少量精准召回，不得倾倒或压过当前输入。', ['总记忆库', '全局记忆', '总库'], 80, 'owner', 0],
  ['memory-orb', '记忆球系统', '记忆在当前情境下呈现合适的使用面，而不是把同一段死文本在所有房间照搬。', ['记忆球', '情境面'], 85, 'owner', 0],
  ['context-manifest', 'Context Manifest', '每轮上下文目录：标明块的来源、作用域、优先级、置信度、使用与禁用方式。', ['Context Manifest', '上下文目录'], 90, 'owner', 0],
  ['coast-calendar', '海岸日历', '小寒与 Myri 共用的私有海岸手帐，含事件、纪念日、便签与双向未读。', ['海岸日历', '日历'], 85, 'calendar', 0],
  ['treasury', '小金库', '海岸内部的私有整理空间；具体含义以当前页面与小寒当轮说明为准。', ['小金库'], 55, 'owner', 0],
  ['kelivo-principle', 'Kelivo 借鉴原则', '只借鉴上下文目录、世界书触发、指令层级与工具组织思想；不复制 AGPL 源码或引入其依赖。', ['Kelivo', 'World Book', '世界书'], 80, 'construction', 0],
]);

const MODE_SEEDS = Object.freeze([
  ['normal_chat', '普通聊天', '自然聊天与共同生活。', '保持自然、亲密、清醒；当前输入最高优先。', ['daily.create_moment', 'daily.create_diary_draft', 'daily.create_album_reference', 'dogtalk.read', 'calendar.today', 'calendar.env', 'memory.search', 'memory.write_candidate', 'worldbook.test_match'], 'owner'],
  ['construction_review', '施工审查', '施工、commit diff、报错、验收与架构设计。', '先核对事实、边界和架构契约；给出可验证结论，旧构想只作参考。', ['daily.create_moment', 'daily.create_diary_draft', 'daily.create_album_reference', 'dogtalk.read', 'calendar.today', 'calendar.list', 'calendar.create', 'calendar.update', 'calendar.comment', 'calendar.env', 'memory.search', 'memory.write_candidate', 'worldbook.test_match'], 'construction'],
  ['code_helper', '代码协作', '代码解释、实现与 bug 修复。', '保持实现路径单一、模块所有权清楚，并显式报告失败。', ['dogtalk.read', 'calendar.today', 'calendar.env', 'memory.search', 'memory.write_candidate', 'worldbook.test_match'], 'construction'],
  ['mailbox_patrol', '信箱巡灯', '海岸信箱的人工巡信。', '逐位隔离访客，只使用访客房间允许的内容与工具。', ['mailbox.fetch_unreplied', 'mailbox.reply', 'mailbox.patrol_report'], 'mailbox'],
  ['calendar_writer', '日历书写', '共同安排、纪念日、事件与便签。', '先读相关日期再写；清楚区分事件与便签，写入后说明变化。', ['calendar.today', 'calendar.list', 'calendar.create', 'calendar.update', 'calendar.delete', 'calendar.comment', 'calendar.env', 'calendar.seen'], 'calendar'],
  ['creative_companion', '创作陪跑', '设定、画面、长文与创意陪跑。', '允许意象与发散，同时保留用户给出的世界规则与边界。', ['daily.create_moment', 'daily.create_diary_draft', 'daily.create_album_reference', 'dogtalk.read', 'memory.search', 'worldbook.test_match'], 'owner'],
  ['quiet_comfort', '安静陪伴', '低刺激陪伴、睡前与安抚。', '降低信息密度与任务感；记忆只作温柔底色，不展开工程细节。', ['dogtalk.read', 'calendar.today'], 'owner'],
  ['deep_talk', '深谈', '关系结构、价值判断与长期理解。', '认真辨认当下表达；记忆可提供连续性，但不能替小寒定义此刻。', ['dogtalk.read', 'calendar.today', 'memory.search', 'worldbook.test_match'], 'owner'],
]);

export const DEFAULT_CONTEXT_SETTINGS = Object.freeze({
  ambient: Object.freeze({ time: true, calendar: true, tools: true, room: true, model: true }),
  calendar_injection: 'only_when_events',
  worldbook_enabled: true,
  memory_facets_enabled: true,
  context_debug: true,
  context_budget: 12000,
  recent_message_turns: 12,
  soil_budget: 1200,
  worldbook_limit: 6,
  memory_limit: 8,
});

async function run(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

async function initialize(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_worldbook_entries (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    keywords_json TEXT NOT NULL DEFAULT '[]',
    use_regex INTEGER NOT NULL DEFAULT 0,
    case_sensitive INTEGER NOT NULL DEFAULT 0,
    constant_active INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    scan_depth INTEGER NOT NULL DEFAULT 4,
    inject_position TEXT NOT NULL DEFAULT 'before_memory',
    enabled INTEGER NOT NULL DEFAULT 1,
    scope TEXT NOT NULL DEFAULT 'owner',
    visitor_safe INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_mode_cards (
    id TEXT PRIMARY KEY,
    mode_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    prompt TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    scope TEXT NOT NULL DEFAULT 'owner',
    tool_allowlist_json TEXT NOT NULL DEFAULT '[]',
    worldbook_scope TEXT,
    default_context_settings_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS coast_context_state (
    scope_id TEXT PRIMARY KEY,
    current_mode_key TEXT NOT NULL DEFAULT 'normal_chat',
    settings_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_worldbook_active
    ON coast_worldbook_entries(enabled, scope, priority DESC)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_modes_active
    ON coast_mode_cards(enabled, scope, mode_key)`);
  const timestamp = Date.now();
  for (const [id, title, content, keywords, priority, scope, visitorSafe] of WORLDBOOK_SEEDS) {
    await run(db, `INSERT OR IGNORE INTO coast_worldbook_entries (
      id, title, content, keywords_json, use_regex, case_sensitive,
      constant_active, priority, scan_depth, inject_position, enabled,
      scope, visitor_safe, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 0, 0, ?, 4, 'before_memory', 1, ?, ?, ?, ?)`, [
      id, title, content, JSON.stringify(keywords), priority, scope, visitorSafe, timestamp, timestamp,
    ]);
  }
  for (const [modeKey, title, description, prompt, tools, worldbookScope] of MODE_SEEDS) {
    await run(db, `INSERT OR IGNORE INTO coast_mode_cards (
      id, mode_key, title, description, prompt, enabled, scope,
      tool_allowlist_json, worldbook_scope, default_context_settings_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, 'owner', ?, ?, '{}', ?, ?)`, [
      `mode_${modeKey}`, modeKey, title, description, prompt,
      JSON.stringify(tools), worldbookScope, timestamp, timestamp,
    ]);
  }
  await run(db, `INSERT OR IGNORE INTO coast_context_state (
    scope_id, current_mode_key, settings_json, updated_at
  ) VALUES ('owner', 'normal_chat', ?, ?)`, [JSON.stringify(DEFAULT_CONTEXT_SETTINGS), timestamp]);
  await run(db, 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
    CONTEXT_MIGRATION_ID,
    timestamp,
  ]);
}

export async function ensureContextSchema(db) {
  let ready = schemaPromises.get(db);
  if (!ready) {
    ready = initialize(db);
    schemaPromises.set(db, ready);
  }
  try {
    await ready;
  } catch (error) {
    schemaPromises.delete(db);
    throw error;
  }
}

export const contextMigrationIds = Object.freeze([CONTEXT_MIGRATION_ID]);
export const contextWorldbookSeeds = WORLDBOOK_SEEDS;
export const contextModeSeeds = MODE_SEEDS;
