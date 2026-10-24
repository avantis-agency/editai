#!/usr/bin/env python3
"""
cortar-mudos.py — remove os espaços SEM FALA de clipes (deixa dinâmico) via whisper por PALAVRA,
junta na ordem dada e (opcional) acelera. Imune a som ambiente (vento) que derrota o silencedetect
por volume — ver aprendizado 017.

Uso:
  cortar-mudos.py <saida.mp4> <clipe1.mp4> [clipe2.mp4 ...] [--speed 1.5] [--lang pt]
                  [--gap 0.25] [--pad 0.10] [--model small]

- Transcreve cada clipe com whisper (word timestamps), agrupa palavras em "runs" (mesma frase
  enquanto o gap entre palavras <= --gap), corta os gaps maiores e os rabos sem fala, com --pad de
  respiro. Junta tudo (normaliza 720x1280) e, se --speed, acelera vídeo+áudio preservando o tom.
- Para TIMESTAMP, modelo `small` basta (a regra "nunca small" é só p/ QA de TEXTO — ver voz-e-fonetica).

Pré-req: ffmpeg, openai-whisper (CLI `whisper`), python3.
"""
import subprocess, sys, os, json, argparse, tempfile

def run(c): return subprocess.run(c, capture_output=True, text=True)
def dur(p): return float(run(["ffprobe","-v","error","-show_entries","format=duration","-of","default=nk=1:nw=1",p]).stdout.strip())

def words(mp4, wavdir, lang, model):
    base=os.path.splitext(os.path.basename(mp4))[0]
    wav=os.path.join(wavdir, base+".wav")
    run(["ffmpeg","-y","-i",mp4,"-ar","16000","-ac","1",wav])
    run(["whisper",wav,"--language",lang,"--model",model,"--word_timestamps","True",
         "--output_format","json","--output_dir",wavdir,"--verbose","False"])
    jp=os.path.join(wavdir, base+".json")
    if not os.path.exists(jp): return []
    j=json.load(open(jp)); ws=[]
    for s in j.get("segments",[]):
        for w in s.get("words",[]):
            if "start" in w and "end" in w: ws.append((w["start"],w["end"]))
    return ws

def keep_runs(d, ws, gap, pad):
    if not ws: return [[0.0,d]]
    runs=[]; cs,ce=ws[0]
    for s,e in ws[1:]:
        if s-ce<=gap: ce=e
        else: runs.append((cs,ce)); cs,ce=s,e
    runs.append((cs,ce))
    iv=[]
    for a,b in runs:
        a=max(0.0,a-pad); b=min(d,b+pad)
        if b-a<0.05: continue
        if iv and a<=iv[-1][1]: iv[-1][1]=max(iv[-1][1],b)
        else: iv.append([a,b])
    return iv

def tighten(mp4, out, ws, gap, pad, W=720, H=1280, FPS=24):
    d=dur(mp4); keep=keep_runs(d, ws, gap, pad)
    parts=[]; lab=""
    for i,(a,b) in enumerate(keep):
        parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS,scale={W}:{H},setsar=1,fps={FPS}[v{i}];")
        parts.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a{i}];")
        lab+=f"[v{i}][a{i}]"
    fc="".join(parts)+f"{lab}concat=n={len(keep)}:v=1:a=1[v][a]"
    r=run(["ffmpeg","-y","-i",mp4,"-filter_complex",fc,"-map","[v]","-map","[a]",
           "-c:v","libx264","-crf","18","-preset","veryfast","-pix_fmt","yuv420p","-r",str(FPS),
           "-c:a","aac","-b:a","192k","-ar","48000",out])
    if r.returncode!=0: print(f"✗ erro cortando {mp4}\n{r.stderr[-600:]}"); sys.exit(1)
    return d, dur(out), len(keep)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("out"); ap.add_argument("clips", nargs="+")
    ap.add_argument("--speed", type=float, default=None)
    ap.add_argument("--lang", default="pt"); ap.add_argument("--model", default="small")
    ap.add_argument("--gap", type=float, default=0.25); ap.add_argument("--pad", type=float, default=0.10)
    a=ap.parse_args()
    for c in a.clips:
        if not os.path.isfile(c): print(f"✗ não encontrado: {c}"); sys.exit(1)
    wavdir=tempfile.mkdtemp(prefix="cortar-mudos-"); work=tempfile.mkdtemp(prefix="cortar-tight-")
    tights=[]; raw=0; tot=0
    print(f"== Cortando mudos por fala (whisper {a.model}, gap={a.gap}s pad={a.pad}s) ==")
    for i,c in enumerate(a.clips,1):
        ws=words(c, wavdir, a.lang, a.model)
        out=os.path.join(work, f"{i:02d}.mp4")
        d,td,n=tighten(c, out, ws, a.gap, a.pad)
        tights.append(out); raw+=d; tot+=td
        print(f"[{i:02d}] {os.path.basename(c)}: {d:.1f}s -> {td:.1f}s ({n} runs de fala)")
    # concat
    listf=os.path.join(work,"list.txt")
    open(listf,"w").write("".join(f"file '{t}'\n" for t in tights))
    joined = a.out if not a.speed else os.path.join(work,"joined.mp4")
    r=run(["ffmpeg","-y","-f","concat","-safe","0","-i",listf,"-c","copy",joined])
    if r.returncode!=0:
        run(["ffmpeg","-y","-f","concat","-safe","0","-i",listf,"-c:v","libx264","-crf","18","-preset","veryfast","-c:a","aac","-b:a","192k",joined])
    if a.speed:
        r=run(["ffmpeg","-y","-i",joined,"-filter_complex",
               f"[0:v]setpts=PTS/{a.speed}[v];[0:a]atempo={a.speed}[a]","-map","[v]","-map","[a]",
               "-c:v","libx264","-crf","18","-preset","veryfast","-pix_fmt","yuv420p",
               "-c:a","aac","-b:a","192k","-ar","48000",a.out])
        if r.returncode!=0: print(r.stderr[-600:]); sys.exit(1)
    fd=dur(a.out)
    print(f"\nbruto {raw:.1f}s -> só fala {tot:.1f}s" + (f" -> {a.speed}x: {fd:.1f}s" if a.speed else f" ({fd:.1f}s)"))
    print(f"✓ SAÍDA: {a.out}")

if __name__=="__main__": main()
