// Provisional sound effects synthesized by ffmpeg itself: nothing is downloaded.
// Replace them with licensed library sounds (see assets/sfx/README.md) when available.
//   bun lib/edit-engine/cli.ts sfx-synth [dir]     (default: assets/sfx)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ffmpeg } from "./measure.ts";
import { SQUAD_ROOT } from "./spec.ts";

export const SYNTH = {
  // pink noise, sin^2 swell over 0.6 s, band-limited, phased: a soft whoosh peaking at 0.3 s
  "whoosh-synth.wav": {
    peak_at: 0.3, duration: 0.6,
    args: ["-f", "lavfi", "-i", "anoisesrc=d=0.6:c=pink:r=48000:a=0.9",
      "-af", "aeval='val(0)*pow(sin(PI*t/0.6),2)':c=same,highpass=f=350,lowpass=f=4200,aphaser=type=t:speed=1.6:decay=0.5,pan=stereo|c0=c0|c1=c0,volume=14dB"],
  },
  // falling 60->30 Hz sine with fast decay plus a 15 ms noise click: an impact for zoom punches
  "hit-synth.wav": {
    peak_at: 0.0, duration: 0.8,
    args: ["-f", "lavfi", "-i", "aevalsrc='0.62*sin(2*PI*(62*t-18*t*t))*exp(-5.5*t)+0.2*(random(0)*2-1)*exp(-120*t)':s=48000:d=0.8",
      "-af", "pan=stereo|c0=c0|c1=c0"],
  },
  // 1.5 s upward sweep 200 -> 1200 Hz with rising level: tension before a reveal
  "riser-synth.wav": {
    peak_at: 1.5, duration: 1.5,
    args: ["-f", "lavfi", "-i", "aevalsrc='0.5*pow(t/1.5,1.6)*sin(2*PI*(200*t+333.3*t*t))':s=48000:d=1.5",
      "-af", "afade=t=out:st=1.42:d=0.08,pan=stereo|c0=c0|c1=c0"],
  },
} as const;

export function synthAll(dir = join(SQUAD_ROOT, "assets", "sfx")): Record<string, { file: string; peak_at: number; duration: number }> {
  mkdirSync(dir, { recursive: true });
  const manifest: Record<string, { file: string; peak_at: number; duration: number }> = {};
  for (const [name, s] of Object.entries(SYNTH)) {
    const file = join(dir, name);
    ffmpeg([...s.args, "-c:a", "pcm_s16le", file]);
    manifest[name] = { file: name, peak_at: s.peak_at, duration: s.duration };
  }
  writeFileSync(join(dir, "sfx-manifest.json"), JSON.stringify({ provisional: true, generated_by: "lib/edit-engine/sfx-synth.ts", sounds: manifest }, null, 2));
  return manifest;
}
