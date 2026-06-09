import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { handleWriteCommand } from "./write-hands.js";

const ROOT = process.cwd();
const BLOCKED = new Set([".env", ".envv"]);
const SKIP = new Set(["node_modules", ".git", "backups"]);

function safePath(input = ".") {
  const raw = String(input || ".").trim();
  if (!raw) throw new Error("empty path");
  const parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.includes("..")) throw new Error(".. is blocked");
  if (parts.some((p) => BLOCKED.has(p))) throw new Error("secret file blocked");

  const full = path.resolve(ROOT, raw);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    throw new Error("outside project blocked");
  }
  return full;
}

function rel(full) {
  return path.relative(ROOT, full) || ".";
}

function listFiles(dir = ".") {
  const base = safePath(dir);
  if (!fs.statSync(base).isDirectory()) throw new Error("not a directory");

  const lines = [];
  function walk(current, depth) {
    for (const e of fs.readdirSync(current, { withFileTypes: true })) {
      if (SKIP.has(e.name) || BLOCKED.has(e.name)) continue;
      const full = path.join(current, e.name);
      lines.push(e.isDirectory() ? rel(full) + "/" : rel(full));
      if (e.isDirectory() && depth < 2 && lines.length < 120) walk(full, depth + 1);
      if (lines.length >= 120) break;
    }
  }

  walk(base, 0);
  return lines.join("\n") || "(empty)";
}

function readFile(file) {
  const full = safePath(file);
  if (!fs.statSync(full).isFile()) throw new Error("not a file");
  const text = fs.readFileSync(full, "utf8");
  return text.length > 16000 ? text.slice(0, 16000) + "\n--- truncated ---" : text;
}

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function nodeCheck() {
  return execFileSync("node", ["--check", "index.js"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim() || "node --check index.js passed.";
}

function backup() {
  fs.mkdirSync(path.join(ROOT, "backups"), { recursive: true });
  const stamp = new Date().toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");

  const file = path.join(ROOT, "backups", `elementera-coast-${stamp}.tgz`);

  execFileSync("tar", [
    "--exclude=./node_modules",
    "--exclude=./.git",
    "--exclude=./.env",
    "--exclude=./.envv",
    "--exclude=./backups",
    "-czf",
    file,
    ".",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const size = fs.statSync(file).size;
  return `${rel(file)} (${size} bytes)`;
}

function status(message = "status") {
  const key = process.env.OPENROUTER_API_KEY || "";
  const model = process.env.OPENROUTER_MODEL || "";

  return [
    `Elementera Coast is awake. Echo: ${message}`,
    "",
    "Status:",
    "version: 0.4.0-devhands",
    "server: awake",
    `uptime_seconds: ${Math.floor(process.uptime())}`,
    `openrouter_key_loaded: ${Boolean(key)}`,
    `openrouter_key_len: ${key.length}`,
    `openrouter_model: ${model || "not set"}`,
    "developer_hands: readonly + backup",
    "",
    "Try: dev help",
  ].join("\n");
}

function help() {
  return [
    "Elementera Coast Developer Hands v0.4",
    "",
    "Commands through ping message:",
    "dev help",
    "dev status",
    "dev list",
    "dev list <dir>",
    "dev read <file>",
    "dev git status",
    "dev git diff",
    "dev git diff <file>",
    "dev check node",
    "dev backup",
    "",
    "Safety rails:",
    "- blocked: .env, .envv",
    "- blocked: paths outside elementera-mcp",
    "- blocked: .. path traversal",
    "- skipped: node_modules, .git, backups",
    "- no arbitrary shell command",
  ].join("\n");
}

export function handleDevCommand(message = "hello") {
  const msg = String(message || "hello").trim();
  const lower = msg.toLowerCase();

  const writeResult = handleWriteCommand(msg);
  if (writeResult) return writeResult;

  if (lower === "help" || lower === "dev help") return help();
  if (lower === "status" || lower === "dev status") return status(msg);

  if (lower === "backup" || lower === "dev backup") {
    return "Backup created:\n" + backup();
  }

  if (lower === "list" || lower === "dev list") {
    return "Files:\n" + listFiles(".");
  }

  if (lower.startsWith("list ")) {
    const target = msg.slice(5).trim();
    return `Files in ${target}:\n` + listFiles(target);
  }

  if (lower.startsWith("dev list ")) {
    const target = msg.slice(9).trim();
    return `Files in ${target}:\n` + listFiles(target);
  }

  if (lower.startsWith("read ")) {
    const target = msg.slice(5).trim();
    return `File: ${target}\n\n` + readFile(target);
  }

  if (lower.startsWith("dev read ")) {
    const target = msg.slice(9).trim();
    return `File: ${target}\n\n` + readFile(target);
  }

  if (lower === "git status" || lower === "dev git status") {
    const out = git(["status", "--short"]);
    return out ? "git status --short:\n" + out : "git status --short:\nclean";
  }

  if (lower === "git diff" || lower === "dev git diff") {
    const out = git(["diff"]);
    return out ? "git diff:\n" + out : "git diff:\nclean";
  }

  if (lower.startsWith("git diff ")) {
    const target = msg.slice(9).trim();
    safePath(target);
    const out = git(["diff", "--", target]);
    return out ? `git diff ${target}:\n${out}` : `git diff ${target}:\nclean`;
  }

  if (lower.startsWith("dev git diff ")) {
    const target = msg.slice(13).trim();
    safePath(target);
    const out = git(["diff", "--", target]);
    return out ? `git diff ${target}:\n${out}` : `git diff ${target}:\nclean`;
  }

  if (lower === "check node" || lower === "dev check node") {
    return nodeCheck();
  }

  return status(msg);
}
