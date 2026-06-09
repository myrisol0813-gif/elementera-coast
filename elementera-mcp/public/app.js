async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function roomCard(room) {
  return `<a class="card" href="${room.path}"><strong>${room.title}</strong><span>${room.description}</span><small>Status: ${room.status}</small></a>`;
}

function statusCard(status) {
  const awake = status && status.ok;
  return `<article class="card"><strong><span class="lamp"></span>${awake ? "server awake" : "server not available"}</strong><span>version: ${status.version || "unknown"}</span><span>uptime_seconds: ${status.uptime_seconds ?? "unknown"}</span><span>openrouter_model: ${status.openrouter_model || "not set"}</span><span>openrouter_key_loaded: ${String(Boolean(status.openrouter_key_loaded))}</span><small>${status.note || "No secrets are exposed."}</small></article>`;
}

function releaseCard(release) {
  const summary = release.summary || release.description || "No summary provided.";
  const zip = release.zip_name ? `<small>${release.zip_name}</small>` : `<small>${release.status || "recorded"}</small>`;
  return `<article class="card"><strong>${release.version} ${release.title}</strong><span>${summary}</span>${zip}</article>`;
}

function releaseDashboard(manifest) {
  const releases = manifest.releases || [];
  const latest = manifest.latest_release || releases[releases.length - 1] || null;
  const zips = manifest.local_zip_time_capsules || [];
  const releaseCards = releases.map(releaseCard).join("");
  const zipList = zips.map((zip) => `<span class="capsule">${zip}</span>`).join("");
  const latestText = latest ? `${latest.version} ${latest.title}` : "unknown";
  return `<article class="card dashboard"><strong><span class="lamp"></span>latest release</strong><span>${latestText}</span><small>current_version: ${manifest.current_version || "local data fallback"}</small></article><article class="card dashboard"><strong>local zip time capsules</strong><span>Saved release seed packages recorded by Kryo.</span><div class="capsules">${zipList || "<span class='capsule'>No local zip records yet.</span>"}</div></article>${releaseCards}`;
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
    const manifest = await loadJson("/api/releases");
    target.innerHTML = releaseDashboard(manifest);
    return;
  } catch (apiError) {
    try {
      const releases = await loadJson("/data/releases.json");
      target.innerHTML = releaseDashboard({
        ok: true,
        current_version: "local data fallback",
        latest_release: releases[releases.length - 1] || null,
        releases,
        local_zip_time_capsules: releases.map((release) => release.zip_name).filter(Boolean),
        note: "Loaded from local JSON fallback."
      });
    } catch (fallbackError) {
      showFallback(target, "Release manifest unavailable", "Release manifest is not available yet.");
    }
  }
}

renderStatus();
renderRooms();
renderReleases();