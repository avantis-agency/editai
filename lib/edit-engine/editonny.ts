// The installed editonny (optional): where it is, which version, and one way to call its helpers.
// Every call runs the engine's own .venv Python with -B, PYTHONDONTWRITEBYTECODE=1 and
// HF_HUB_OFFLINE=1, so nothing is written into the install (no __pycache__) and nothing is
// downloaded. Its code is never copied into the squad. Bun only.
//
// Version policy: on Windows the squad stays on editonny 1.0.0 while soumatheusgomes/editonny#7
// is open; a 1.1.x install there is treated as absent for B-roll (README, "Windows: editonny para
// o EditAi"). Set EDITAI_EDITONNY_ANY_VERSION=1 to try another version anyway.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PINNED_VERSION = "1.0.0";

export interface EditonnyStatus {
  root: string | null;       // ~/.local/share/editonny (or the parent of EDITONNY_ENGINE)
  engine: string | null;     // <root>/engine
  python: string | null;     // <engine>/.venv python
  version: string | null;    // <root>/VERSION
  usable: boolean;           // found, .venv present and the version accepted on this OS
  reason: string;            // why not usable (empty when usable)
  helpers: Record<string, boolean>;
}

const pyIn = (engine: string) => join(engine, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

export function editonnyStatus(): EditonnyStatus {
  const engine = process.env.EDITONNY_ENGINE ?? join(homedir(), ".local", "share", "editonny", "engine");
  const root = join(engine, "..");
  const helpers: Record<string, boolean> = {};
  for (const h of ["suggest_visuals", "render_visuals", "face_layout", "transcribe"]) helpers[h] = existsSync(join(engine, "helpers", `${h}.py`));
  if (!existsSync(join(engine, "helpers"))) return { root: null, engine: null, python: null, version: null, usable: false, reason: "editonny não encontrado (instale o skill editonny ou defina EDITONNY_ENGINE)", helpers };
  const python = existsSync(pyIn(engine)) ? pyIn(engine) : null;
  let version: string | null = null;
  try { version = readFileSync(join(root, "VERSION"), "utf8").trim() || null; } catch { /* older installs have no VERSION */ }
  let reason = "";
  if (!python) reason = "editonny sem a .venv do motor (rode o setup do editonny uma vez)";
  else if (process.platform === "win32" && version && version !== PINNED_VERSION && !process.env.EDITAI_EDITONNY_ANY_VERSION)
    reason = `editonny ${version} no Windows: o EditAi fica na ${PINNED_VERSION} por causa de soumatheusgomes/editonny#7 (veja o README, "Windows: editonny para o EditAi")`;
  return { root, engine, python, version, usable: !reason, reason, helpers };
}

export interface HelperRun { code: number; stdout: string; stderr: string; seconds: number; json: any | null }

/** Runs engine/helpers/<name>.py; `json` is the last stdout line parsed (the helpers' contract), or null. */
export function runHelper(st: EditonnyStatus, name: string, args: string[], cwd: string, timeoutMs = 600_000): HelperRun {
  if (!st.usable || !st.engine || !st.python) throw new Error(st.reason || "editonny indisponível");
  const t0 = performance.now();
  const p = Bun.spawnSync([st.python, "-B", join(st.engine, "helpers", `${name}.py`), ...args], {
    cwd, stdout: "pipe", stderr: "pipe", timeout: timeoutMs,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", HF_HUB_OFFLINE: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  const stdout = p.stdout.toString(), stderr = p.stderr.toString();
  const last = stdout.trim().split(/\r?\n/).pop() ?? "";
  let json: any = null;
  try { json = last.startsWith("{") ? JSON.parse(last) : null; } catch { json = null; }
  return { code: p.exitCode ?? 1, stdout, stderr, seconds: (performance.now() - t0) / 1000, json };
}
