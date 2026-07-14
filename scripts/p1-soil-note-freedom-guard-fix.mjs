import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function patch(path, oldText, newText) {
  const url = new URL(path, root);
  const source = await readFile(url, 'utf8');
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`missing patch target: ${path}`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`ambiguous patch target: ${path}`);
  await writeFile(url, `${source.slice(0, first)}${newText}${source.slice(first + oldText.length)}`);
}

await patch(
  'functions/memory-router.js',
  `    pocket_candidates: pocketCandidatesMode === 'replace'\n      ? organizedPocketCandidates\n      : pocketCandidatesMode === 'keep'\n        ? oldSoil.pocket_candidates\n        : pocketCandidatesMode === 'clear'\n          ? []\n          : organizedPocketCandidates,`,
  `    pocket_candidates: pocketCandidatesMode === 'replace'\n      ? organizedPocketCandidates\n      : pocketCandidatesMode === 'keep'\n        ? oldSoil.pocket_candidates\n        : pocketCandidatesMode === 'clear'\n          ? []\n          : organizedPocketCandidates.length ? organizedPocketCandidates : oldSoil.pocket_candidates,`,
);

await patch(
  'tests/memory.test.mjs',
  `assert.equal(guardedSoilData.soil.pocket_candidates.length, 0, 'legacy mode-less candidate output keeps the current display behavior');`,
  `assert.equal(guardedSoilData.soil.pocket_candidates.length, 1, 'missing mode plus an empty candidate list must preserve old soil candidates');\nassert.equal(guardedSoilData.soil.pocket_candidates[0].life_core, guardedCandidate.life_core);`,
);

console.log('P1 soil candidate empty guard fix staged');
