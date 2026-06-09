async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function roomCard(room) {
  return `<a class="card" href="${room.path}"><strong>${room.title}</strong><span>${room.description}</span><small>Status: ${room.status}</small></a>`;
}

function releaseCard(release) {
  return `<article class="card"><strong>${release.version} ${release.title}</strong><span>${release.description}</span><small>${release.status}</small></article>`;
}

function statusCard(status) {
  const awake = status && status.ok;
  return `<article class="card"><strong><span class="lamp"></span>${awake ? "server awake" : "server not available"}</strong><span>version: ${status.version || "unknown"}</span><span>uptime_seconds: ${status.uptime_seconds ?? "unknown"}</span><span>openrouter_model: ${status.openrouter_model || "not set"}</span><span>openrouter_key_loaded: ${String(Boolean(status.openrouter_key_loaded))}</span><small>${status.note || "No secrets are exposed."}</small></article>`;
}

function showFallback(target, title, message) {
  target.innerHTML = `<article class="card"><strong>${title}</strong><span>${message}</span></article>`;
}

async function renderStatus() {
  const target = document.querySelector("#status");
  try {
    const status = await loadJson("/api/status");
    target.innerHTML = statusCard(status);
  } catch (error) {
    showFallback(target, "server not available", "Status API is not available yet.");
  }
}

async function renderRooms() {
  const target = document.querySelector("#rooms");
  try {
    const rooms = await loadJson("/data/rooms.json");
    target.innerHTML = rooms.map(roomCard).join("");
  } catch (error) {
    showFallback(target, "Rooms unavailable", "Room data could not be loaded, but the App Core shell is still awake.");
  }
}

async function renderReleases() {
  const target = document.querySelector("#releases");
  try {
    const releases = await loadJson("/data/releases.json");
    target.innerHTML = releases.map(releaseCard).join("");
  } catch (error) {
    showFallback(target, "Releases unavailable", "Release data could not be loaded, but the archive lamp is still on.");
  }
}

renderStatus();
renderRooms();
renderReleases();