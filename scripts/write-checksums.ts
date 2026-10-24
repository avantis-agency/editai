#!/usr/bin/env bun
// Rewrites assets/checksums.json: the sha256 of every binary file the squad ships (fonts,
// starter-kit audio, images). `cli.ts doctor` compares them, so a copy installed by a tool that
// saves binary files as text is caught. Run it after adding or changing a binary. Bun only.
//   bun scripts/write-checksums.ts
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const files: Record<string, string> = {};
const found = [...new Bun.Glob("**/*.{ttf,otf,m4a,mp3,wav,png,jpg}").scanSync({ cwd: root })].map((f) => f.replace(/\\/g, "/")).sort();
for (const f of found) files[f] = createHash("sha256").update(readFileSync(join(root, f))).digest("hex");
const about = "sha256 of every binary file the squad ships. cli.ts doctor checks them; regenerate with: bun scripts/write-checksums.ts";
writeFileSync(join(root, "assets", "checksums.json"), JSON.stringify({ about, files }, null, 2) + "\n");
console.log(`${found.length} files -> assets/checksums.json`);
