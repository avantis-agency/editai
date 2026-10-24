// Neutral app-screen placeholder for the POV template while the real screen
// recording does not exist. Drawn by ffmpeg (boxes + Inter text): a generic app
// layout with "PLACEHOLDER" written on it, so it is never mistaken for the product.
//   bun lib/edit-engine/cli.ts placeholder-screen <out.png> [label]
import { resolve } from "node:path";
import { ffmpeg } from "./measure.ts";
import { FONTS_DIR } from "./spec.ts";

export function placeholderScreen(out: string, label = "tela do app"): string {
  const file = resolve(out);
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%");
  const txt = (t: string, size: number, y: number | string, color = "white") =>
    `drawtext=fontfile=Inter-Bold.ttf:text='${esc(t)}':fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}`;
  const card = (y: number, h: number, c = "0x2a2f3a") => `drawbox=x=80:y=${y}:w=920:h=${h}:color=${c}:t=fill`;
  const vf = [
    card(0, 210, "0x1b1f27"), txt("9:41", 40, 60, "0xc9ced8"),
    "drawbox=x=80:y=150:w=420:h=26:color=0x3b4252:t=fill",
    card(300, 360), "drawbox=x=130:y=350:w=200:h=200:color=0x4c566a:t=fill", "drawbox=x=370:y=370:w=560:h=40:color=0x4c566a:t=fill",
    "drawbox=x=370:y=440:w=420:h=30:color=0x434c5e:t=fill",
    card(700, 220), card(960, 220), card(1220, 220),
    "drawbox=x=0:y=1720:w=1080:h=200:color=0x1b1f27:t=fill",
    "drawbox=x=0:y=820:w=1080:h=330:color=0xffd23f@0.92:t=fill",
    txt("PLACEHOLDER", 120, 860, "black"), txt(label, 64, 1000, "black"), txt("trocar pela gravação real", 44, 1080, "0x222222"),
  ].join(",");
  ffmpeg(["-f", "lavfi", "-i", "color=c=0x12151b:s=1080x1920:d=1", "-vf", vf, "-frames:v", "1", "-update", "1", file], FONTS_DIR);
  return file;
}
