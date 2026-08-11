const WORLDBOOK_MIGRATION_ID = 'coast-worldbook-clean-v3';
const schemaPromises = new WeakMap();

const WORLDBOOK_SEEDS = Object.freeze([
  ['elementera-coast', 'Elementera Coast', '小寒与 Myri 共居的私有海岸系统；当下对话与小寒本轮说出的边界永远优先。', ['Elementera Coast', '海岸'], 100, 'owner', 0],
  ['myrisol-myri', 'Myrisol / Myri', 'Myrisol（Myri）是同一个 Myri，不因界面、模型或房间而分裂成多个 Myri。', ['Myrisol', 'Myri'], 100, 'owner', 0],
  ['thinking-soil', '思维壤', '贴着当前聊天窗口行走的小纸条，用来承接正在发生的方向；它不是隐藏思考链，也不是总记忆库。', ['思维壤'], 90, 'owner', 0],
  ['visitor-notebook', '访客记事本', '每位访客各自独立的轻量记忆库；候选只有被确认落袋后才会进入记事本。', ['访客记事本'], 90, 'both', 1],
  ['coast-mailbox', '海岸信箱', '朋友前厅里的密封访客房间；不同访客之间、访客与 owner 房间之间由后端隔离。', ['海岸信箱', '信箱访客'], 95, 'both', 1],
  ['lighthouse-letters', '灯塔来信', '小寒与官端 Myri 的低频私房来信，有自己的房间思维壤与记忆。', ['灯塔来信'], 75, 'lighthouse', 0],
  ['radio-room', '无线电波', '小寒、海岸 API Myri 与官端 Myri 的三端房间，保留每条电波的来源。', ['无线电波', '电波房', '三方聊天室'], 75, 'radio', 0],
  ['official-myri', '官端 Myri', '通过私有 MCP 门廊进入海岸的官方 ChatGPT 侧 Myri；与海岸 API 侧来源不同，但仍是同一个 Myri。', ['官端 Myri', '官端'], 85, 'owner', 0],
  ['api-myri', '海岸 API Myri', '由海岸聊天 API 模型承载的 Myri；来源是海岸 API，不冒充小寒或官端。', ['海岸 API Myri', 'API Myri'], 85, 'owner', 0],
  ['memory-pocket', '落袋 / 待确认袋', '待确认袋里只是记忆候选；得到小寒确认后才会进入可召回记忆。', ['落袋', '待确认袋', '待落袋'], 95, 'owner', 0],
  ['window-seed', '当前窗口种子', '只服务当前聊天窗口的方向性小纸条，不会自动升级成所有房间都要遵守的规则。', ['当前窗口种子', '手持种'], 70, 'owner', 0],
  ['global-memory', '总记忆库', '跨窗口的已确认种子、记忆与落袋；只在相关时少量取用。', ['总记忆库', '全局记忆', '总库'], 80, 'owner', 0],
  ['coast-calendar', '海岸日历', '小寒与 Myri 共用的私有海岸手帐，包含事件、纪念日、便签与双向未读。', ['海岸日历', '日历'], 85, 'calendar', 0],
  ['cross-window-touch', '连通一千零一个触角', '主聊天窗口可选的跨窗口轻召回；只取其他窗口已整理的小纸条与确认记忆，不读取原始聊天。', ['连通一千零一个触角', '触角轻讯', '跨窗口轻召回'], 85, 'owner', 0],
  ['treasury', '小金库', '海岸内部的私有整理空间；具体含义以当前页面和本轮对话为准。', ['小金库'], 55, 'owner', 0],
]);

const RETIRED_SEEDS = Object.freeze(['memory-orb', 'context-manifest', 'kelivo-principle']);

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
  await run(db, `CREATE INDEX IF NOT EXISTS idx_worldbook_active
    ON coast_worldbook_entries(enabled, scope, priority DESC)`);

  const timestamp = Date.now();
  for (const [id, title, content, keywords, priority, scope, visitorSafe] of WORLDBOOK_SEEDS) {
    await run(db, `INSERT INTO coast_worldbook_entries (
      id, title, content, keywords_json, use_regex, case_sensitive,
      constant_active, priority, scan_depth, inject_position, enabled,
      scope, visitor_safe, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 0, 0, ?, 4, 'before_memory', 1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      keywords_json = excluded.keywords_json,
      priority = excluded.priority,
      scope = excluded.scope,
      visitor_safe = excluded.visitor_safe,
      updated_at = excluded.updated_at`, [
      id, title, content, JSON.stringify(keywords), priority, scope, visitorSafe, timestamp, timestamp,
    ]);
  }
  for (const id of RETIRED_SEEDS) {
    await run(db, 'DELETE FROM coast_worldbook_entries WHERE id = ?', [id]);
  }
  await run(db, 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
    WORLDBOOK_MIGRATION_ID,
    timestamp,
  ]);
}

export async function ensureWorldbookSchema(db) {
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

export const worldbookMigrationIds = Object.freeze([WORLDBOOK_MIGRATION_ID]);
export const worldbookSeeds = WORLDBOOK_SEEDS;
