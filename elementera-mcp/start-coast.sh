#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "Elementera Coast waking..."
echo

node --input-type=module <<'NODE'
import dotenv from "dotenv";

dotenv.config({ path: ".envv" });

const key = process.env.OPENROUTER_API_KEY || "";
const model = process.env.OPENROUTER_MODEL || "";

console.log("KEY_LEN=" + key.length);
console.log("KEY_OK=" + (key.startsWith("sk-") && !/\s/.test(key)));
console.log("MODEL=" + model);
console.log();

if (!key) {
  console.error("Missing OPENROUTER_API_KEY in .envv");
  process.exit(1);
}

if (!model) {
  console.error("Missing OPENROUTER_MODEL in .envv");
  process.exit(1);
}
NODE

echo "Starting MCP server on port 3000..."
echo "Keep this terminal open, and keep port 3000 Public."
echo

npm start
