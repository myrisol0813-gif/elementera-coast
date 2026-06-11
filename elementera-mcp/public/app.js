const DRAFT_KEY = "elementera.memoryDraft.v084";
const SHELF_KEY = "elementera.memoryPacketShelf.v086";
let currentPacket = null;
let draftCreatedAt = null;

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function text(value, fallback = "unknown") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}

function fallback(id, title, message) {
  const target = document.querySelector(id);
  if (target) target.innerHTML = `<article class="card"><strong>${title}</strong><span>${message}</span></article>`;
}

function roomCard(room) {
  return `<a class="card" href="${room.path}"><strong>${room.title}</strong><span>${room.description}</span><small>Status: ${room.status}</small></a>`;
}

function releaseCard(release) {
  const summary = release.summary || release.description || "No summary provided.";
  const label = release.zip_name || release.status || "recorded";
  return `<article class="card"><strong>${release.version} ${release.title}</strong><span>${summary}</span><small>${label}</small></article>`;
}

function setMessage(id, message) {
  const target = document.querySelector(id);
  if (target) target.textContent = message;
}

function getDraftFields() {
  return {
    title: document.querySelector("#draft-title-input"),
    type: document.querySelector("#draft-type"),
    tags: document.querySelector("#draft-tags"),
    body: document.querySelector("#draft-body")
  };
}

function parseTags(value) {
  return Array.isArray(value) ? value : (value || "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function tagsToInput(value) {
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function readDraftForm() {
  const fields = getDraftFields();
  return {
    title: fields.title?.value || "",
    type: fields.type?.value || "note",
    tags: fields.tags?.value || "",
    body: fields.body?.value || "",
    saved_at: new Date().toISOString(),
    storage_note: "This is a local browser draft, not yet written to the coast backend."
  };
}

function fillDraftForm(draft) {
  const fields = getDraftFields();
  if (fields.title) fields.title.value = draft.title || "";
  if (fields.type) fields.type.value = draft.type || "note";
  if (fields.tags) fields.tags.value = tagsToInput(draft.tags);
  if (fields.body) fields.body.value = draft.body || "";
}

function hasDraftContent(draft) {
  return Boolean((draft.title || "").trim() || (draft.tags || "").trim() || (draft.body || "").trim());
}

function makeDraftPacket(draft) {
  const now = new Date().toISOString();
  if (!draftCreatedAt) draftCreatedAt = draft.created_at || draft.saved_at || now;
  return {
    id: draft.id || `draft-${Date.now()}`,
    title: draft.title || "",
    type: draft.type || "note",
    tags: parseTags(draft.tags),
    body: draft.body || "",
    created_at: draftCreatedAt,
    updated_at: now,
    source: "local-browser-draft",
    backend_written: false,
    note: "This draft has not been written to the coast backend yet."
  };
}

function updatePacketPreview(message = "Packet preview updated.") {
  const draft = readDraftForm();
  const preview = document.querySelector("#packet-preview");
  if (!preview) return;
  if (!hasDraftContent(draft)) {
    currentPacket = null;
    preview.textContent = "No packet preview yet.";
    setMessage("#packet-message", "Write a draft, then update the preview.");
    return;
  }
  currentPacket = makeDraftPacket(draft);
  preview.textContent = JSON.stringify(currentPacket, null, 2);
  setMessage("#packet-message", message);
}

function loadShelf() {
  try {
    const raw = localStorage.getItem(SHELF_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function saveShelf(list) {
  localStorage.setItem(SHELF_KEY, JSON.stringify(list));
}

function renderShelf() {
  const target = document.querySelector("#packet-shelf");
  if (!target) return;
  const shelf = loadShelf();
  if (!shelf.length) {
    target.innerHTML = `<article class="packet-item"><strong>No local memory packets yet.</strong><span>还没有本地记忆包。</span></article>`;
    setMessage("#shelf-message", "Shelf is local to this browser.");
    return;
  }
  target.innerHTML = shelf.map((packet) => {
    const tags = parseTags(packet.tags).join(", ") || "none";
    return `<article class="packet-item" data-id="${escapeHtml(packet.id)}"><strong>${escapeHtml(packet.title || "Untitled packet")}</strong><span>type: ${escapeHtml(packet.type || "note")}</span><span>tags: ${escapeHtml(tags)}</span><span>updated_at: ${escapeHtml(packet.updated_at || "unknown")}</span><small>backend_written: ${String(Boolean(packet.backend_written))}</small><div class="shelf-item-actions"><button type="button" data-action="restore" data-id="${escapeHtml(packet.id)}">Restore to Draft</button><button type="button" data-action="delete" data-id="${escapeHtml(packet.id)}">Delete</button></div></article>`;
  }).join("");
  setMessage("#shelf-message", `${shelf.length} local packet${shelf.length === 1 ? "" : "s"} stored in this browser.`);
}

function savePacketToShelf() {
  if (!currentPacket) updatePacketPreview("Packet preview updated before saving to shelf.");
  if (!currentPacket) {
    setMessage("#packet-message", "No packet to save yet. Write a draft first.");
    return;
  }
  if (!currentPacket.title.trim() || !currentPacket.body.trim()) {
    setMessage("#packet-message", "Please add both title and body before saving a packet to the local shelf.");
    return;
  }
  const packet = { ...currentPacket, id: currentPacket.id || `draft-${Date.now()}`, backend_written: false, updated_at: new Date().toISOString() };
  const shelf = loadShelf();
  shelf.unshift(packet);
  saveShelf(shelf);
  renderShelf();
  setMessage("#packet-message", "Packet saved to local shelf. 记忆包已放入本地架子。");
}

function restorePacket(id) {
  const packet = loadShelf().find((item) => item.id === id);
  if (!packet) {
    setMessage("#shelf-message", "Packet could not be found.");
    return;
  }
  draftCreatedAt = packet.created_at || null;
  fillDraftForm(packet);
  currentPacket = { ...packet, backend_written: false, updated_at: new Date().toISOString() };
  const preview = document.querySelector("#packet-preview");
  if (preview) preview.textContent = JSON.stringify(currentPacket, null, 2);
  setMessage("#draft-message", "Packet restored to draft.");
  setMessage("#packet-message", "Packet restored to draft.");
  setMessage("#shelf-message", "Packet restored to draft.");
}

function deletePacket(id) {
  const nextShelf = loadShelf().filter((item) => item.id !== id);
  saveShelf(nextShelf);
  renderShelf();
  setMessage("#shelf-message", "Packet deleted from local shelf.");
}

function clearShelf() {
  localStorage.removeItem(SHELF_KEY);
  renderShelf();
  setMessage("#shelf-message", "Local packet shelf cleared. 本地记忆包架已清空。");
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportShelf() {
  const shelf = loadShelf();
  downloadJson(shelf, `elementera-memory-packet-shelf-v086-${stamp()}.json`);
  setMessage("#shelf-message", shelf.length ? "Shelf JSON download started." : "Empty shelf JSON download started.");
}

function loadMemoryDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      setMessage("#draft-message", "No local draft saved yet.");
      updatePacketPreview("Write a draft, then update the preview.");
      return;
    }
    const draft = JSON.parse(raw);
    draftCreatedAt = draft.created_at || draft.saved_at || null;
    fillDraftForm(draft);
    setMessage("#draft-message", "Draft restored from this browser. 草稿已从本机浏览器恢复。");
    updatePacketPreview("Packet preview restored from this browser draft.");
  } catch (error) {
    setMessage("#draft-message", "Local draft could not be restored.");
  }
}

function saveMemoryDraft(event) {
  event.preventDefault();
  try {
    const draft = readDraftForm();
    if (!draftCreatedAt) draftCreatedAt = draft.saved_at;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, created_at: draftCreatedAt }));
    setMessage("#draft-message", "Draft saved locally. 草稿已保存在本机浏览器。");
    updatePacketPreview("Draft saved locally and packet preview updated.");
  } catch (error) {
    setMessage("#draft-message", "Draft could not be saved in this browser.");
  }
}

function clearMemoryDraft() {
  localStorage.removeItem(DRAFT_KEY);
  draftCreatedAt = null;
  fillDraftForm({ title: "", type: "note", tags: "", body: "" });
  currentPacket = null;
  const preview = document.querySelector("#packet-preview");
  if (preview) preview.textContent = "No packet preview yet.";
  setMessage("#draft-message", "Draft cleared. 本机草稿已清除。");
  setMessage("#packet-message", "Packet preview cleared.");
}

async function copyPacket() {
  if (!currentPacket) updatePacketPreview("Packet preview updated before copying.");
  if (!currentPacket) {
    setMessage("#packet-message", "No packet to copy yet. Write a draft first.");
    return;
  }
  const json = JSON.stringify(currentPacket, null, 2);
  try {
    if (!navigator.clipboard) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(json);
    setMessage("#packet-message", "Packet copied to clipboard. 记忆包已复制。");
  } catch (error) {
    setMessage("#packet-message", "Clipboard is unavailable. Please select and copy the preview manually.");
  }
}

function downloadPacket() {
  if (!currentPacket) updatePacketPreview("Packet preview updated before download.");
  if (!currentPacket) {
    setMessage("#packet-message", "No packet to download yet. Write a draft first.");
    return;
  }
  downloadJson(currentPacket, `elementera-memory-draft-v085-${stamp()}.json`);
  setMessage("#packet-message", "Packet JSON download started.");
}

function initMemoryDraft() {
  const form = document.querySelector("#memory-draft-form");
  const clearButton = document.querySelector("#clear-draft");
  const updateButton = document.querySelector("#update-preview");
  const copyButton = document.querySelector("#copy-packet");
  const downloadButton = document.querySelector("#download-packet");
  const saveShelfButton = document.querySelector("#save-packet-shelf");
  const exportShelfButton = document.querySelector("#export-shelf");
  const clearShelfButton = document.querySelector("#clear-shelf");
  const shelfTarget = document.querySelector("#packet-shelf");
  if (form) form.addEventListener("submit", saveMemoryDraft);
  if (clearButton) clearButton.addEventListener("click", clearMemoryDraft);
  if (updateButton) updateButton.addEventListener("click", () => updatePacketPreview("Packet preview updated."));
  if (copyButton) copyButton.addEventListener("click", copyPacket);
  if (downloadButton) downloadButton.addEventListener("click", downloadPacket);
  if (saveShelfButton) saveShelfButton.addEventListener("click", savePacketToShelf);
  if (exportShelfButton) exportShelfButton.addEventListener("click", exportShelf);
  if (clearShelfButton) clearShelfButton.addEventListener("click", clearShelf);
  if (shelfTarget) shelfTarget.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.getAttribute("data-id");
    if (button.dataset.action === "restore") restorePacket(id);
    if (button.dataset.action === "delete") deletePacket(id);
  });
  loadMemoryDraft();
  renderShelf();
}

async function renderStatus() {
  const target = document.querySelector("#status");
  try {
    const status = await loadJson("/api/status");
    target.innerHTML = `<article class="card dashboard"><strong><span class="lamp"></span>${status.ok ? "server awake" : "server not available"}</strong><span>version: ${text(status.version)}</span><span>uptime_seconds: ${text(status.uptime_seconds)}</span><span>openrouter_model: ${text(status.openrouter_model, "not set")}</span><span>openrouter_key_loaded: ${String(Boolean(status.openrouter_key_loaded))}</span><small>${text(status.note, "No secrets are exposed.")}</small></article>`;
  } catch (error) {
    fallback("#status", "server not available", "Status API is not available yet.");
  }
}

async function renderRooms() {
  const target = document.querySelector("#rooms");
  try {
    const rooms = await loadJson("/data/rooms.json");
    target.innerHTML = rooms.length ? rooms.map(roomCard).join("") : `<article class="card"><strong>No rooms yet</strong><span>Room data is empty.</span></article>`;
  } catch (error) {
    fallback("#rooms", "Rooms unavailable", "Room data could not be loaded, but the App Core shell is still awake.");
  }
}

function renderManifest(manifest) {
  const releases = manifest.releases || [];
  const latest = manifest.latest_release || releases[releases.length - 1] || null;
  const latestText = latest ? `${latest.version} ${latest.title}` : "unknown";
  const zips = manifest.local_zip_time_capsules || releases.map((release) => release.zip_name).filter(Boolean);
  document.querySelector("#release-summary").innerHTML = `<article class="card dashboard"><strong><span class="lamp"></span>latest release</strong><span>${latestText}</span><small>current_version: ${text(manifest.current_version, "local data fallback")}</small></article>`;
  document.querySelector("#releases").innerHTML = releases.length ? releases.map(releaseCard).join("") : `<article class="card"><strong>No releases yet</strong><span>Release records are not available yet.</span></article>`;
  document.querySelector("#capsules").innerHTML = zips.length ? `<article class="card dashboard"><strong>local zip time capsules</strong><span>Saved release seed packages recorded by Kryo.</span><div class="capsules">${zips.map((zip) => `<span class="capsule">${zip}</span>`).join("")}</div></article>` : `<article class="card"><strong>No time capsules yet</strong><span>Local zip time capsule records are not available yet.</span></article>`;
}

async function renderReleases() {
  try {
    renderManifest(await loadJson("/api/releases"));
  } catch (apiError) {
    try {
      const releases = await loadJson("/data/releases.json");
      renderManifest({ current_version: "local data fallback", latest_release: releases[releases.length - 1], releases, local_zip_time_capsules: releases.map((release) => release.zip_name).filter(Boolean) });
    } catch (fallbackError) {
      fallback("#release-summary", "Release manifest unavailable", "Release manifest is not available yet.");
      fallback("#releases", "No release list", "Release list is not available yet.");
      fallback("#capsules", "No time capsules", "Local zip time capsule records are not available yet.");
    }
  }
}

initMemoryDraft();
renderStatus();
renderRooms();
renderReleases();

function renderValidationResult087(result) {
  const target = document.querySelector("#validator-result");
  if (!target) return;
  const summary = result.packet_summary || {};
  const errors = result.errors || [];
  const warnings = result.warnings || [];
  const statusClass = result.valid ? "valid" : "invalid";
  target.innerHTML = `<article class="packet-item validator-${statusClass}"><strong>${result.valid ? "valid" : "invalid"}</strong><span>${escapeHtml(result.note || "Validation only.")}</span><span>checked_at: ${escapeHtml(result.checked_at || "unknown")}</span><span>summary: ${escapeHtml(JSON.stringify(summary))}</span><span>errors: ${errors.length ? escapeHtml(errors.join("; ")) : "none"}</span><span>warnings: ${warnings.length ? escapeHtml(warnings.join("; ")) : "none"}</span></article>`;
}

async function validatePacket087() {
  if (!currentPacket) updatePacketPreview("Packet preview updated before validation.");
  if (!currentPacket) {
    const target = document.querySelector("#validator-result");
    if (target) target.innerHTML = `<article class="packet-item validator-invalid"><strong>invalid</strong><span>No packet to validate yet. Write a draft first.</span></article>`;
    return;
  }
  try {
    const res = await fetch("/api/validate-memory-packet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentPacket)
    });
    if (!res.ok) throw new Error(`validator ${res.status}`);
    renderValidationResult087(await res.json());
  } catch (error) {
    const target = document.querySelector("#validator-result");
    if (target) target.innerHTML = `<article class="packet-item validator-invalid"><strong>validator unavailable</strong><span>Packet validator is not available yet.</span></article>`;
  }
}

const validateButton087 = document.querySelector("#validate-packet");
if (validateButton087) validateButton087.addEventListener("click", validatePacket087);