const DRAFT_KEY = "elementera.memoryDraft.v084";

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

function setDraftMessage(message) {
  const target = document.querySelector("#draft-message");
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

function loadMemoryDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      setDraftMessage("No local draft saved yet.");
      return;
    }
    const draft = JSON.parse(raw);
    fillDraftForm(draft);
    setDraftMessage("Draft restored from this browser. 草稿已从本机浏览器恢复。");
  } catch (error) {
    setDraftMessage("Local draft could not be restored.");
  }
}

function saveMemoryDraft(event) {
  event.preventDefault();
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(readDraftForm()));
    setDraftMessage("Draft saved locally. 草稿已保存在本机浏览器。");
  } catch (error) {
    setDraftMessage("Draft could not be saved in this browser.");
  }
}

function clearMemoryDraft() {
  localStorage.removeItem(DRAFT_KEY);
  fillDraftForm({ title: "", type: "note", tags: "", body: "" });
  setDraftMessage("Draft cleared. 本机草稿已清除。");
}

function initMemoryDraft() {
  const form = document.querySelector("#memory-draft-form");
  const clearButton = document.querySelector("#clear-draft");
  if (form) form.addEventListener("submit", saveMemoryDraft);
  if (clearButton) clearButton.addEventListener("click", clearMemoryDraft);
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