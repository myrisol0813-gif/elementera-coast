import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const BLOCKED = new Set([".env", ".envv"]);
const SKIP = new Set(["node_modules", ".git", "backups"]);

function safePath(input = ".") {
  const raw = String(input || ".").trim();
  if (!raw) throw new Error("empty path");

  const parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.includes("..")) throw new Error(".. is blocked");
  if (parts.some((p) => BLOCKED.has(p))) throw new Error("secret file blocked");
  if (parts.some((p) => SKIP.has(p))) throw new Error("protected directory blocked");

  const full = path.resolve(ROOT, raw);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    throw new Error("outside project blocked");
  }

  return full;
}

function rel(full) {
  return path.relative(ROOT, full) || ".";
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

function splitMessage(message) {
  const text = String(message || "").replace(/\r\n/g, "\n");
  const firstBreak = text.indexOf("\n");

  if (firstBreak === -1) {
    return {
      command: text.trim(),
      body: "",
    };
  }

  return {
    command: text.slice(0, firstBreak).trim(),
    body: text.slice(firstBreak + 1),
  };
}

function ensureSafeText(text) {
  const body = String(text ?? "");
  if (!body.trim()) throw new Error("empty content is blocked");
  if (body.length > 80000) throw new Error("content too large");
  return body;
}

function writeFile(target, content) {
  const full = safePath(target);
  const body = ensureSafeText(content);

  const parent = path.dirname(full);
  if (!parent.startsWith(ROOT)) throw new Error("outside project blocked");

  const backupFile = backup();

  fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(full, body, "utf8");

  return [
    "Write completed.",
    `file: ${rel(full)}`,
    `bytes: ${Buffer.byteLength(body, "utf8")}`,
    `backup: ${backupFile}`,
  ].join("\n");
}

function appendFile(target, content) {
  const full = safePath(target);
  const body = ensureSafeText(content);
  const backupFile = backup();

  const parent = path.dirname(full);
  fs.mkdirSync(parent, { recursive: true });

  const prefix = fs.existsSync(full) ? "\n" : "";
  fs.appendFileSync(full, prefix + body, "utf8");

  return [
    "Append completed.",
    `file: ${rel(full)}`,
    `bytes_added: ${Buffer.byteLength(prefix + body, "utf8")}`,
    `backup: ${backupFile}`,
  ].join("\n");
}

function gitCommit(message) {
  const msg = String(message || "").trim();

  if (!msg) throw new Error("empty commit message");
  if (msg.length > 120) throw new Error("commit message too long");
  if (msg.includes("\n")) throw new Error("multiline commit message blocked");

  const status = execFileSync("git", ["status", "--short"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  if (!status) {
    return "git commit skipped: working tree clean";
  }

  if (status.includes(".env") || status.includes(".envv")) {
    throw new Error("secret file appears in git status; commit blocked");
  }

  execFileSync("git", ["add", "--", "."], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  execFileSync("git", ["commit", "-m", msg], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const after = execFileSync("git", ["status", "--short"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  return [
    "git commit completed.",
    `message: ${msg}`,
    after ? `remaining status:\n${after}` : "working tree: clean",
  ].join("\n");
}

export function handleWriteCommand(message = "") {
  const { command, body } = splitMessage(message);
  const lower = command.toLowerCase();

  if (lower === "dev write help" || lower === "write help") {
    return [
      "Write Hands v0.4.1",
      "",
      "Commands:",
      "dev write <file>",
      "<content on following lines>",
      "",
      "dev append <file>",
      "<content on following lines>",
      "",
      "dev commit <message>",
      "",
      "Safety:",
      "- write and append create backup first",
      "- blocked: .env, .envv",
      "- blocked: node_modules, .git, backups",
      "- blocked: .. and outside project paths",
      "- no delete, no push, no arbitrary shell",
    ].join("\n");
  }

  if (lower.startsWith("dev write ")) {
    const target = command.slice("dev write ".length).trim();
    return writeFile(target, body);
  }

  if (lower.startsWith("write ")) {
    const target = command.slice("write ".length).trim();
    return writeFile(target, body);
  }

  if (lower.startsWith("dev append ")) {
    const target = command.slice("dev append ".length).trim();
    return appendFile(target, body);
  }

  if (lower.startsWith("append ")) {
    const target = command.slice("append ".length).trim();
    return appendFile(target, body);
  }

  if (lower.startsWith("dev commit ")) {
    const msg = command.slice("dev commit ".length).trim();
    return gitCommit(msg);
  }

  if (lower.startsWith("commit ")) {
    const msg = command.slice("commit ".length).trim();
    return gitCommit(msg);
  }

  return null;
}
