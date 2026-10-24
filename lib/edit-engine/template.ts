// Templates are partial edit specs with "$slot:<name>" placeholders.
// fillTemplate() swaps every placeholder for the item's value (or the slot default)
// and returns a resolved EditSpec. Bun only.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { SQUAD_ROOT, type EditSpec } from "./spec.ts";

export interface SlotDef { type: string; required?: boolean; default?: unknown; description?: string }
export interface Template {
  id: string; name: string; summary: string;
  slots: Record<string, SlotDef>;
  hooks_timeline: { at: string | number; hook: string; why: string }[];
  spec: Record<string, unknown>;
}

export function loadTemplate(id: string): Template {
  const file = join(SQUAD_ROOT, "templates", "edit", `${id}.json`);
  if (!existsSync(file)) throw new Error(`template not found: ${id} (looked in templates/edit/)`);
  return JSON.parse(readFileSync(file, "utf8"));
}

const SLOT = /^\$slot:([a-z0-9_]+)$/;
const INLINE = /\$slot:([a-z0-9_]+)/g;

function fill(node: unknown, values: Record<string, unknown>): unknown {
  if (typeof node === "string") {
    const whole = node.match(SLOT);
    if (whole) return values[whole[1]];
    if (node.startsWith("@squad/")) return join(SQUAD_ROOT, node.slice(7));
    // "$slot:a" inside a longer string, or arithmetic "=expr" strings
    const s = node.replace(INLINE, (_, k) => String(values[k]));
    if (s.startsWith("=")) {
      // arithmetic only ("=$slot:duration - 0.5"): anything else is refused, never evaluated
      const expr = s.slice(1);
      if (!/^[\d.\s+\-*/()]+$/.test(expr)) throw new Error(`template expression is not arithmetic: ${node}`);
      return Number(Function(`"use strict";return (${expr})`)());
    }
    return s;
  }
  if (Array.isArray(node)) return node.map((n) => fill(n, values)).filter((n) => n !== undefined && n !== null);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      const f = fill(v, values);
      if (f !== undefined) out[k] = f;
    }
    return out;
  }
  return node;
}

/**
 * A media path written in a slots or batch file: "${VAR}" parts come from the environment (examples
 * ship with variables, never with paths of one machine) and a relative path is taken from `baseDir`.
 * "@squad/...", "@music:..." and "@sfx:..." pass through. An unset EDITAI_* falls back to its
 * legacy RVS_* name (retention-video-studio, before 2.0.0).
 */
export function expandPath(p: string, baseDir: string): string {
  const s = p.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => {
    const v = process.env[k] || (k.startsWith("EDITAI_") ? process.env[`RVS_${k.slice(7)}`] : undefined);
    if (!v) throw new Error(`environment variable ${k} is not set (used in "${p}")`);
    return v.replace(/\\/g, "/");
  });
  return s.startsWith("@") || isAbsolute(s) ? s : resolve(baseDir, s);
}

/** Expands the media-path and audio-path slots of a slots object (see expandPath). */
export function expandSlotPaths(t: Template, slots: Record<string, unknown>, baseDir: string): Record<string, unknown> {
  const out = { ...slots };
  for (const [name, def] of Object.entries(t.slots)) {
    if (!/path/.test(def.type) || typeof out[name] !== "string") continue;
    out[name] = expandPath(out[name] as string, baseDir);
  }
  return out;
}

export function fillTemplate(t: Template, slots: Record<string, unknown>): EditSpec {
  const values: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const [name, def] of Object.entries(t.slots)) {
    if (slots[name] !== undefined) values[name] = slots[name];
    else if (def.default !== undefined) values[name] = def.default;
    else if (def.required) missing.push(name);
    else values[name] = undefined;
  }
  if (missing.length) throw new Error(`template ${t.id}: missing required slots: ${missing.join(", ")}`);
  const spec = fill(t.spec, values) as EditSpec;
  spec.template = t.id;
  return spec;
}
