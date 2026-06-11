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

renderStatus();
renderRooms();
renderReleases();