const DRAFT_KEY = "elementera.memoryDraft.v084";
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
  return (value || "").split(",").map((tag) => tag.trim()).filter(Boolean);
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
  if (fields.tags) fields.tags.value = draft.tags || "";
  if (fields.body) fields.body.value = draft.body || "";
}

function hasDraftContent(draft) {
  return Boolean((draft.title || "").trim() || (draft.tags || "").trim() || (draft.body || "").trim());
}

function makeDraftPacket(draft) {
  const now = new Date().toISOString();
  if (!draftCreatedAt) draftCreatedAt = draft.saved_at || now;
  return {
    id: `draft-${Date.now()}`,
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

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function downloadPacket() {
  if (!currentPacket) updatePacketPreview("Packet preview updated before download.");
  if (!currentPacket) {
    setMessage("#packet-message", "No packet to download yet. Write a draft first.");
    return;
  }
  const blob = new Blob([JSON.stringify(currentPacket, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `elementera-memory-draft-v085-${stamp()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setMessage("#packet-message", "Packet JSON download started.");
}

function initMemoryDraft() {
  const form = document.querySelector("#memory-draft-form");
  const clearButton = document.querySelector("#clear-draft");
  const updateButton = document.querySelector("#update-preview");
  const copyButton = document.querySelector("#copy-packet");
  const downloadButton = document.querySelector("#download-packet");
  if (form) form.addEventListener("submit", saveMemoryDraft);
  if (clearButton) clearButton.addEventListener("click", clearMemoryDraft);
  if (updateButton) updateButton.addEventListener("click", () => updatePacketPreview("Packet preview updated."));
  if (copyButton) copyButton.addEventListener("click", copyPacket);
  if (downloadButton) downloadButton.addEventListener("click", downloadPacket);
  loadMemoryDraft();
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