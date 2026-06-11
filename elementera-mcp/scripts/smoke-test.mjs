const baseUrl = (process.env.COAST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const results = [];
let createdInboxId = null;
let cleanupWarning = null;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  let data = null;
  try { data = await response.json(); } catch (error) { data = null; }
  return { response, data };
}

function makePacket(title = "SMOKE TEST PACKET - SAFE TO DELETE") {
  const now = new Date().toISOString();
  return {
    id: `smoke-test-${Date.now()}`,
    title,
    type: "note",
    tags: ["smoke-test", "safe-to-delete"],
    body: "Temporary smoke test packet. Safe to delete.",
    created_at: now,
    updated_at: now,
    source: "qa-smoke-test",
    backend_written: false
  };
}

async function main() {
  console.log("Elementera Coast QA Smoke Test Suite");
  console.log(`base_url: ${baseUrl}`);
  console.log("");

  try {
    const { data } = await requestJson("/health");
    record("GET /health", Boolean(data && data.ok === true), data ? "json returned" : "no json");
  } catch (error) { record("GET /health", false, error.message); }

  try {
    const { data } = await requestJson("/api/status");
    const ok = Boolean(data && data.ok === true && typeof data.openrouter_key_loaded === "boolean");
    record("GET /api/status", ok, ok ? `openrouter_key_loaded: ${data.openrouter_key_loaded}` : "unexpected status shape");
  } catch (error) { record("GET /api/status", false, error.message); }

  try {
    const { data } = await requestJson("/api/releases");
    const ok = Boolean(data && data.ok === true && Array.isArray(data.releases));
    record("GET /api/releases", ok, ok ? `releases: ${data.releases.length}` : "unexpected releases shape");
  } catch (error) { record("GET /api/releases", false, error.message); }

  try {
    const { data } = await requestJson("/api/memories");
    const ok = Boolean(data && data.ok === true && data.official_memory === true && Array.isArray(data.items));
    record("GET /api/memories", ok, ok ? `official memories: ${data.items.length}` : "unexpected official memories shape");
  } catch (error) { record("GET /api/memories", false, error.message); }

  const validPacket = makePacket();
  const invalidPacket = { ...makePacket(""), title: "" };

  try {
    const { data } = await requestJson("/api/validate-memory-packet", { method: "POST", body: JSON.stringify(validPacket) });
    record("POST /api/validate-memory-packet valid", Boolean(data && data.valid === true), data ? "validator responded" : "no json");
  } catch (error) { record("POST /api/validate-memory-packet valid", false, error.message); }

  try {
    const { data } = await requestJson("/api/validate-memory-packet", { method: "POST", body: JSON.stringify(invalidPacket) });
    const ok = Boolean(data && (data.valid === false || (Array.isArray(data.errors) && data.errors.length > 0)));
    record("POST /api/validate-memory-packet invalid", ok, ok ? "invalid packet refused" : "bad packet accepted");
  } catch (error) { record("POST /api/validate-memory-packet invalid", false, error.message); }

  try {
    const { data } = await requestJson("/api/memory-drafts");
    const ok = Boolean(data && data.ok === true && data.storage_state === "draft_inbox" && data.official_memory === false);
    record("GET /api/memory-drafts", ok, ok ? `count: ${data.count}` : "unexpected draft inbox shape");
  } catch (error) { record("GET /api/memory-drafts", false, error.message); }

  try {
    const { data } = await requestJson("/api/memory-drafts", { method: "POST", body: JSON.stringify(validPacket) });
    createdInboxId = data?.inbox_id || data?.item?.inbox_id || null;
    const ok = Boolean(data && data.saved === true && createdInboxId && (data.official_memory === false || data.item?.official_memory === false));
    record("POST /api/memory-drafts", ok, ok ? `inbox_id: ${createdInboxId}` : "draft write failed");
  } catch (error) { record("POST /api/memory-drafts", false, error.message); }

  if (createdInboxId) {
    try {
      const { data } = await requestJson(`/api/memory-drafts/${encodeURIComponent(createdInboxId)}`);
      const item = data?.item;
      const ok = Boolean(data && data.ok === true && item && item.official_memory === false && item.approved === false);
      record("GET /api/memory-drafts/:inbox_id", ok, ok ? "test item found" : "test item missing or unsafe flags");
    } catch (error) { record("GET /api/memory-drafts/:inbox_id", false, error.message); }
  } else {
    record("GET /api/memory-drafts/:inbox_id", false, "no inbox_id to read");
  }

  try {
    const { data } = await requestJson("/api/memory-drafts-export");
    const ok = Boolean(data && data.ok === true && data.export_type === "memory_draft_inbox" && data.official_memory === false);
    record("GET /api/memory-drafts-export", ok, ok ? `count: ${data.count}` : "unexpected export shape");
  } catch (error) { record("GET /api/memory-drafts-export", false, error.message); }

  if (createdInboxId) {
    try {
      const { data } = await requestJson(`/api/memory-drafts/${encodeURIComponent(createdInboxId)}`, { method: "DELETE" });
      const ok = Boolean(data && data.deleted === true);
      record("DELETE /api/memory-drafts/:inbox_id", ok, ok ? "test item deleted" : "delete did not confirm");
      if (!ok) cleanupWarning = `WARNING test item may remain: ${createdInboxId}`;
    } catch (error) {
      cleanupWarning = `WARNING test item may remain: ${createdInboxId}`;
      record("DELETE /api/memory-drafts/:inbox_id", false, error.message);
    }

    try {
      const { response, data } = await requestJson(`/api/memory-drafts/${encodeURIComponent(createdInboxId)}`);
      const ok = response.status === 404 || data?.ok === false;
      record("GET deleted /api/memory-drafts/:inbox_id", ok, ok ? "test item no longer readable" : "test item still readable");
    } catch (error) { record("GET deleted /api/memory-drafts/:inbox_id", false, error.message); }
  } else {
    record("DELETE /api/memory-drafts/:inbox_id", false, "no inbox_id to delete");
    record("GET deleted /api/memory-drafts/:inbox_id", false, "no inbox_id to verify");
  }

  console.log("");
  if (cleanupWarning) console.log(cleanupWarning);
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`summary: passed ${passed} / failed ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL smoke suite crashed - ${error.message}`);
  process.exitCode = 1;
});