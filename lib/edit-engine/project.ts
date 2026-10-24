// The user's project folder: where briefings, client profiles, style profiles
// and downloaded references live. Never inside the squad (the squad is shared
// by every client and every person who installs it). Bun only.
//
//   <project>/editai/briefs/<id>/        one guided briefing (state, questions, plan)
//   <project>/editai/profiles/<client>.json   answers saved per client or project
//   <project>/editai/styles/<name>.style.json reference style profiles (user templates)
//   <project>/editai/references/<name>/  downloaded reference videos and their measurements
//
// Legacy: before 2.0.0 the squad was retention-video-studio and wrote to <project>/rvs/.
// That folder is still read (profiles, history) and never written; new files go to editai/.
import { existsSync, mkdirSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import { SQUAD_ROOT } from "./spec.ts";

export class ProjectError extends Error {}

export const APP_DIR = "editai";
export const LEGACY_APP_DIRS = ["rvs"]; // retention-video-studio, before 2.0.0: read only

/** Project folder: --project, else $EDITAI_PROJECT (legacy $RVS_PROJECT), else $SQUADS_PROJECT_ROOT, else the current folder. Refuses the squad itself. */
export function projectDir(given?: string): string {
  const dir = resolve(given || process.env.EDITAI_PROJECT || process.env.RVS_PROJECT || process.env.SQUADS_PROJECT_ROOT || process.cwd());
  const rel = relative(SQUAD_ROOT, dir);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new ProjectError(`project folder is inside the squad (${dir}). Profiles, styles and references belong to the user's project: pass --project <folder> or set EDITAI_PROJECT`);
  }
  return dir;
}

/** <project>/editai/<sub...>, created when missing. Every write goes here. */
export const appDir = (project: string, ...sub: string[]) => {
  const d = join(project, APP_DIR, ...sub);
  mkdirSync(d, { recursive: true });
  return d;
};

/** Folders to read from, new first: <project>/editai, then the legacy <project>/rvs. */
export const appRoots = (project: string) => [APP_DIR, ...LEGACY_APP_DIRS].map((n) => join(project, n));

/** "Clínica Sorriso" -> "clinica-sorriso" (file-safe, accents dropped). */
export function slug(s: string): string {
  const out = s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return out || "projeto";
}

/** Where a client profile is saved (always editai/). */
export const profilePath = (project: string, client: string) => join(appDir(project, "profiles"), `${slug(client)}.json`);
/** Where a client profile is read from: editai/ first, then the legacy rvs/; null when there is none. */
export const findProfile = (project: string, client: string) =>
  appRoots(project).map((r) => join(r, "profiles", `${slug(client)}.json`)).find((p) => existsSync(p)) ?? null;
export const stylePath = (project: string, name: string) => join(appDir(project, "styles"), `${slug(name)}.style.json`);
export const hasProfile = (project: string, client: string) => findProfile(project, client) !== null;
