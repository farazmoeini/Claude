"""StreamCut pipeline: VOD -> transcript -> highlight detection -> 9:16 clips with captions.

Steps:
  1. extract_audio     ffmpeg -> 16 kHz mono PCM
  2. loudness_curve    RMS per 0.5 s, z-scored (hype moments are usually loud)
  3. transcribe        faster-whisper with word timestamps (runs locally, free)
  4. find_candidates   sliding windows scored by loudness + hype words + speech density
  5. ai_refine         optional: Claude picks the best moments and writes title/hashtags
  6. render_clip       ffmpeg crop/layout + burned-in word-by-word captions (ASS)
"""
from __future__ import annotations

import json
import math
import os
import re
import subprocess
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Callable

import numpy as np

SR = 16000
HOP = 0.5  # seconds per loudness frame

HYPE_WORDS = {
    # German
    "krass", "alter", "digga", "boah", "wow", "nein", "neee", "was", "wie", "geil", "heftig",
    "unglaublich", "wahnsinn", "lol", "haha", "hahaha", "oh", "mein", "gott", "ernsthaft",
    "junge", "brudi", "bruder", "omg", "lass", "los", "jaaa", "ja", "nice", "clip", "das",
    # English
    "insane", "crazy", "what", "no", "yes", "omg", "bro", "dude", "clutch", "lets", "go",
    "holy", "wtf", "unbelievable", "chat", "clip", "dead", "wait",
}
# Stronger signal: short exclamations / phrases
HYPE_PHRASES = [
    r"oh mein gott", r"nicht ernsthaft", r"was zur", r"let'?s go", r"oh my god", r"no way",
    r"clip (das|it|that)", r"bist du dumm", r"ich (bin|war) tot", r"wie geil", r"alter was",
]


@dataclass
class Word:
    start: float
    end: float
    text: str


@dataclass
class Clip:
    start: float
    end: float
    score: float
    text: str = ""
    title: str = ""
    description: str = ""
    hashtags: list[str] = field(default_factory=list)
    reason: str = ""
    file: str = ""


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd[:3])}...\n{p.stderr[-2000:]}")
    return p


def probe(path: Path) -> dict:
    out = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)]).stdout
    data = json.loads(out)
    v = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
    if v is None:
        raise RuntimeError("Datei enthält keine Videospur.")
    return {
        "duration": float(data["format"]["duration"]),
        "width": int(v["width"]),
        "height": int(v["height"]),
        "has_audio": a is not None,
    }


# ---------------------------------------------------------------- 1 + 2: audio

def extract_audio(video: Path, wav: Path) -> np.ndarray:
    run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", str(wav)])
    return np.fromfile(wav, dtype=np.int16).astype(np.float32) / 32768.0


def loudness_curve(samples: np.ndarray) -> np.ndarray:
    hop = int(SR * HOP)
    n = max(1, len(samples) // hop)
    frames = samples[: n * hop].reshape(n, hop)
    rms = np.sqrt((frames ** 2).mean(axis=1) + 1e-10)
    db = 20 * np.log10(rms)
    voiced = db[db > np.percentile(db, 30)]
    if len(voiced) < 4:
        voiced = db
    std = voiced.std() or 1.0
    return np.clip((db - np.median(voiced)) / std, -3, 4)


# ---------------------------------------------------------------- 3: transcription

_MODEL = None


def transcribe(wav_samples: np.ndarray, language: str | None, progress: Callable[[float], None]) -> list[Word]:
    global _MODEL
    from faster_whisper import WhisperModel

    if _MODEL is None:
        size = os.environ.get("STREAMCUT_WHISPER", "small")
        _MODEL = WhisperModel(size, device="cpu", compute_type="int8")
    total = len(wav_samples) / SR
    segments, _info = _MODEL.transcribe(
        wav_samples,
        language=language or None,
        word_timestamps=True,
        vad_filter=True,
        beam_size=1,
    )
    words: list[Word] = []
    for seg in segments:
        for w in seg.words or []:
            t = w.word.strip()
            if t:
                words.append(Word(float(w.start), float(w.end), t))
        if total > 0:
            progress(min(1.0, seg.end / total))
    return words


# ---------------------------------------------------------------- optional: chat activity
CHAT_DELAY = 4.0  # viewers react a few seconds after the moment happens
CHAT_HYPE = {"kekw", "lul", "omegalul", "pog", "pogchamp", "poggers", "w", "ww", "www", "clip", "clipit",
             "lol", "lmao", "haha", "xd", "pepelaugh", "monkas", "omg", "wtf", "!clip", "krass", "digga"}


def _ts(s: str) -> float | None:
    m = re.match(r"\[?(\d+):(\d{2})(?::(\d{2}))?(?:\.\d+)?\]?$", s.strip())
    if not m:
        return None
    a, b, c = m.group(1), m.group(2), m.group(3)
    return int(a) * 3600 + int(b) * 60 + int(c) if c is not None else int(a) * 60 + int(b)


def parse_chat(raw: bytes) -> list[tuple[float, str]]:
    """Accepts TwitchDownloader JSON ({comments:[{content_offset_seconds, message:{body}}]})
    or text lines like '[0:12:34] user: message' / '00:12:34 user: message'."""
    text = raw.decode("utf-8", errors="replace").lstrip("\ufeff")
    out: list[tuple[float, str]] = []
    if text.lstrip().startswith("{"):
        data = json.loads(text)
        for c in data.get("comments", []):
            t = c.get("content_offset_seconds")
            body = (c.get("message") or {}).get("body", "") if isinstance(c.get("message"), dict) else str(c.get("message", ""))
            if t is not None:
                out.append((float(t), body))
        return out
    for line in text.splitlines():
        parts = line.strip().split(" ", 1)
        if len(parts) == 2:
            t = _ts(parts[0])
            if t is not None:
                out.append((t, parts[1]))
    return out


def chat_curve(msgs: list[tuple[float, str]], n_frames: int) -> np.ndarray:
    """Messages per frame (+ emote/hype bonus), shifted back by CHAT_DELAY, smoothed, z-scored."""
    raw = np.zeros(n_frames)
    for t, body in msgs:
        i = int(max(0.0, t - CHAT_DELAY) / HOP)
        if 0 <= i < n_frames:
            words = {w.strip(".,!?:").lower() for w in body.split()}
            raw[i] += 1 + 1.5 * len(words & CHAT_HYPE)
    k = max(1, int(5 / HOP))
    smooth = np.convolve(raw, np.ones(k) / k, mode="same")
    std = smooth.std()
    return np.zeros(n_frames) if std == 0 else np.clip((smooth - smooth.mean()) / std, -2, 5)


# ---------------------------------------------------------------- 4: candidates

def _norm(t: str) -> str:
    return re.sub(r"[^\wäöüß']", "", t.lower())


def find_candidates(
    words: list[Word], loud: np.ndarray, duration: float, min_len: float, max_len: float, n: int,
    chat: np.ndarray | None = None,
) -> list[Clip]:
    target = (min_len + max_len) / 2
    step = 2.0
    hype = np.zeros_like(loud)
    speech = np.zeros_like(loud)
    for w in words:
        i = min(len(loud) - 1, int(w.start / HOP))
        speech[i] += 1
        if _norm(w.text) in HYPE_WORDS:
            hype[i] += 1
        if w.text.count("!") or w.text.isupper() and len(w.text) > 2:
            hype[i] += 0.5
    # phrase bonus
    full = " ".join(_norm(w.text) for w in words)
    if words:
        idx_map = []
        pos = 0
        for w in words:
            idx_map.append(pos)
            pos += len(_norm(w.text)) + 1
        for pat in HYPE_PHRASES:
            for m in re.finditer(pat, full):
                k = int(np.searchsorted(idx_map, m.start(), side="right")) - 1
                i = min(len(loud) - 1, int(words[max(k, 0)].start / HOP))
                hype[i] += 3

    def score(s: float, e: float) -> float:
        a, b = int(s / HOP), max(int(s / HOP) + 1, int(e / HOP))
        seg = loud[a:b]
        if len(seg) == 0:
            return -1e9
        peak = np.sort(seg)[-max(1, len(seg) // 10):].mean()  # top-10% loudness
        dens = speech[a:b].sum() / max(1e-6, (e - s))  # words per second
        silence_pen = 0.0 if dens > 0.8 else (0.8 - dens) * 2
        hook_n = int(5 / HOP)
        hook = float(seg[:hook_n].max()) + 0.8 * float(hype[a:a + hook_n].sum())
        chat_bonus = 0.0
        if chat is not None and len(chat):
            cseg = chat[a:b]
            if len(cseg):
                chat_bonus = 1.2 * float(np.sort(cseg)[-max(1, len(cseg) // 10):].mean()) + 0.6 * float(cseg[:hook_n * 2].max())
        return float(1.0 * peak + 0.3 * seg.mean() + 0.6 * hype[a:b].sum() + 0.3 * min(dens, 3)
                     + 0.8 * hook - silence_pen + chat_bonus)

    cands: list[Clip] = []
    if duration <= min_len:
        return [Clip(0.0, duration, 0.0)]
    t = 0.0
    while t + min_len <= duration:
        e = min(duration, t + target)
        cands.append(Clip(t, e, score(t, e)))
        t += step
    cands.sort(key=lambda c: c.score, reverse=True)

    chosen: list[Clip] = []
    for c in cands:
        if all(c.end <= o.start or c.start >= o.end for o in chosen):
            chosen.append(c)
        if len(chosen) >= n:
            break
    for c in chosen:
        c.start, c.end = snap(words, c.start, c.end, min_len, max_len, duration)
        c.text = text_between(words, c.start, c.end)
    return chosen  # best first


def snap(words: list[Word], s: float, e: float, min_len: float, max_len: float, duration: float) -> tuple[float, float]:
    """Move cut points to sentence/word gaps so clips don't start or end mid-word."""
    if not words:
        return s, e
    # start: nearest word start after a pause (>0.35s) within 4s before s
    starts = [w for i, w in enumerate(words) if i == 0 or w.start - words[i - 1].end > 0.35 or words[i - 1].text.endswith((".", "!", "?"))]
    cand = [w.start for w in starts if s - 2 <= w.start <= s + 3]
    if cand:
        s = min(cand, key=lambda x: abs(x - s))
    ends = [w.end for i, w in enumerate(words) if w.text.endswith((".", "!", "?")) or i == len(words) - 1 or words[i + 1].start - w.end > 0.35]
    cand = [x for x in ends if s + min_len <= x <= s + max_len]
    if cand:
        e = min(cand, key=lambda x: abs(x - e))
    s = max(0.0, s - 0.15)
    e = min(duration, e + 0.3)
    if e - s < min_len:
        e = min(duration, s + min_len)
    if e - s > max_len:
        e = s + max_len
    return round(s, 2), round(e, 2)


def text_between(words: list[Word], s: float, e: float) -> str:
    return " ".join(w.text for w in words if w.start >= s - 0.05 and w.end <= e + 0.05)


# ---------------------------------------------------------------- 5: optional AI refinement

def ai_refine(cands: list[Clip], words: list[Word], n: int, language: str | None) -> tuple[list[Clip], str]:
    """Ask Claude to pick the n best candidates and write social copy. Returns (clips, note)."""
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        for c in cands:
            c.title = fallback_title(c.text)
            c.hashtags = ["#stream", "#clips", "#highlights"]
        return sorted(cands[:n], key=lambda c: c.start), "Kein ANTHROPIC_API_KEY gesetzt: Titel automatisch aus dem Transkript erzeugt."
    try:
        import anthropic
        from pydantic import BaseModel

        class Pick(BaseModel):
            index: int
            viral_score: int
            title: str
            description: str
            hashtags: list[str]
            reason: str

        class Picks(BaseModel):
            clips: list[Pick]

        listing = "\n\n".join(
            f"[{i}] {fmt_time(c.start)}-{fmt_time(c.end)} (Signal-Score {c.score:.1f})\n{c.text[:1500]}"
            for i, c in enumerate(cands)
        )
        lang = "Deutsch" if (language or "de").startswith("de") else "der Sprache des Transkripts"
        client = anthropic.Anthropic()
        resp = client.messages.parse(
            model=os.environ.get("STREAMCUT_MODEL", "claude-opus-5-5"),
            max_tokens=8000,
            output_config={"effort": "low"},
            system=(
                "Du bist Editor für Kurzvideos (TikTok, YouTube Shorts, Reels) aus Livestreams. "
                "Wähle Momente mit starkem Hook in den ersten 3 Sekunden, Emotion, Humor, Überraschung "
                "oder einer abgeschlossenen Mini-Story. Meide Momente, die ohne Kontext unverständlich sind."
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Hier sind Kandidaten-Ausschnitte aus einem Stream-Transkript. Wähle die {n} besten "
                    f"(nach index), bewerte sie 1-100 und schreibe für jeden auf {lang}: einen kurzen, "
                    f"klickstarken Titel (max. 60 Zeichen), eine 1-Satz-Beschreibung und 3-6 Hashtags.\n\n{listing}"
                ),
            }],
            output_format=Picks,
        )
        if resp.stop_reason == "refusal" or resp.parsed_output is None:
            raise RuntimeError(f"stop_reason={resp.stop_reason}")
        out: list[Clip] = []
        for p in sorted(resp.parsed_output.clips, key=lambda p: -p.viral_score):
            if 0 <= p.index < len(cands) and cands[p.index] not in out:
                c = cands[p.index]
                c.title, c.description, c.reason = p.title, p.description, p.reason
                c.hashtags = [h if h.startswith("#") else f"#{h}" for h in p.hashtags]
                c.score = float(p.viral_score)
                out.append(c)
        out = out[:n] or cands[:n]
        out.sort(key=lambda c: c.start)
        return out, "Highlights von Claude bewertet."
    except Exception as e:  # never block rendering on the AI step
        for c in cands:
            c.title = c.title or fallback_title(c.text)
        return sorted(cands[:n], key=lambda c: c.start), f"KI-Bewertung übersprungen ({type(e).__name__}: {str(e)[:200]})"


def fallback_title(text: str) -> str:
    words = text.split()
    t = " ".join(words[:8])
    return (t[:57] + "…") if len(t) > 60 else (t or "Stream-Highlight")


def fmt_time(t: float) -> str:
    return f"{int(t // 60):02d}:{int(t % 60):02d}"


# ---------------------------------------------------------------- 6: rendering

W, H = 1080, 1920


def ass_time(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def ass_escape(t: str) -> str:
    return t.replace("\\", "").replace("{", "(").replace("}", ")")


def write_ass(words: list[Word], s: float, e: float, path: Path, y: int, group: int = 3, max_chars: int = 16) -> None:
    clip_words = [w for w in words if w.start >= s - 0.05 and w.end <= e + 0.05]
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    # group up to `group` words, but keep each line short enough to fit the 9:16 frame
    chunks: list[list[Word]] = []
    cur: list[Word] = []
    for w in clip_words:
        if cur and (len(cur) >= group or sum(len(x.text) + 1 for x in cur) + len(w.text) > max_chars
                    or w.start - cur[-1].end > 0.6):
            chunks.append(cur)
            cur = []
        cur.append(w)
    if cur:
        chunks.append(cur)
    lines = []
    for chunk in chunks:
        for i, w in enumerate(chunk):
            st = w.start - s
            en = (chunk[i + 1].start if i + 1 < len(chunk) else w.end + 0.25) - s
            parts = []
            for j, x in enumerate(chunk):
                txt = ass_escape(x.text.upper())
                if j == i:
                    parts.append(r"{\c&H00E5FF&\fscx110\fscy110}" + txt + r"{\c&HFFFFFF&\fscx100\fscy100}")
                else:
                    parts.append(txt)
            lines.append(f"Dialogue: 0,{ass_time(st)},{ass_time(en)},Cap,,0,0,0,,{{\\pos({W // 2},{y})}}" + " ".join(parts))
    path.write_text(head + "\n".join(lines) + "\n", encoding="utf-8")


def layout_filter(layout: str, src_w: int, src_h: int, cam: dict) -> tuple[str, int]:
    """Return (filter_complex producing [v], caption y position)."""
    if layout == "split":
        # top: facecam region, bottom: gameplay (center crop)
        cx, cy, cw, ch = (cam.get(k, d) for k, d in (("x", 0.0), ("y", 0.0), ("w", 0.3), ("h", 0.3)))
        fx, fy = int(cx * src_w), int(cy * src_h)
        fw, fh = max(16, int(cw * src_w)), max(16, int(ch * src_h))
        top_h = 720
        bot_h = H - top_h
        f = (
            f"[0:v]split=2[a][b];"
            f"[a]crop={fw}:{fh}:{fx}:{fy},scale={W}:{top_h}:force_original_aspect_ratio=increase,crop={W}:{top_h}[top];"
            f"[b]scale=-2:{bot_h}:force_original_aspect_ratio=increase,crop={W}:{bot_h}[bot];"
            f"[top][bot]vstack=inputs=2,setsar=1[v]"
        )
        return f, top_h
    if layout == "blur":
        f = (
            f"[0:v]split=2[a][b];"
            f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.12[bg];"
            f"[b]scale={W}:-2[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]"
        )
        return f, int(H * 0.74)
    # center crop
    f = f"[0:v]scale=-2:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1[v]"
    return f, int(H * 0.70)


def render_clip(video: Path, clip: Clip, words: list[Word], out: Path, layout: str, info: dict, cam: dict,
                captions: bool = True) -> None:
    f, cap_y = layout_filter(layout, info["width"], info["height"], cam)
    if captions and words:
        ass = out.with_suffix(".ass")
        write_ass(words, clip.start, clip.end, ass, cap_y)
        f = f.replace("[v]", "[pre]") + f";[pre]ass='{ass.as_posix()}'[v]"
    dur = clip.end - clip.start
    cmd = [
        "ffmpeg", "-y", "-v", "error", "-ss", f"{clip.start:.2f}", "-t", f"{dur:.2f}", "-i", str(video),
        "-filter_complex", f, "-map", "[v]",
    ]
    if info["has_audio"]:
        cmd += ["-map", "0:a:0", "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11"]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
            "-movflags", "+faststart", str(out)]
    run(cmd)
    thumb = out.with_suffix(".jpg")
    run(["ffmpeg", "-y", "-v", "error", "-ss", "1", "-i", str(out), "-frames:v", "1", "-vf", "scale=360:-2", str(thumb)])


# ---------------------------------------------------------------- orchestration

def process(video: Path, workdir: Path, opts: dict, report: Callable[[str, float], None]) -> dict:
    workdir.mkdir(parents=True, exist_ok=True)
    report("Video wird analysiert", 0.02)
    info = probe(video)
    n = int(opts.get("num_clips", 5))
    min_len, max_len = float(opts.get("min_len", 20)), float(opts.get("max_len", 50))
    language = opts.get("language") or None
    layout = opts.get("layout", "center")

    words: list[Word] = []
    if info["has_audio"]:
        report("Audio wird extrahiert", 0.05)
        samples = extract_audio(video, workdir / "audio.pcm")
        loud = loudness_curve(samples)
        report("Sprache wird transkribiert", 0.08)
        words = transcribe(samples, language, lambda p: report("Sprache wird transkribiert", 0.08 + 0.6 * p))
        (workdir / "transcript.json").write_text(json.dumps([asdict(w) for w in words], ensure_ascii=False))
    else:
        loud = np.zeros(max(1, int(info["duration"] / HOP)))

    chat = None
    if opts.get("chat_path"):
        try:
            msgs = parse_chat(Path(opts["chat_path"]).read_bytes())
            chat = chat_curve(msgs, len(loud)) if msgs else None
            opts["chat_messages"] = len(msgs)
        except Exception as e:  # a broken chat file must not break clipping
            opts["chat_error"] = str(e)[:200]

    report("Highlights werden gesucht", 0.70)
    cands = find_candidates(words, loud, info["duration"], min_len, max_len, n * 3 if words else n, chat)
    clips, note = ai_refine(cands, words, n, language) if words else (
        sorted(cands[:n], key=lambda c: c.start), "Kein Ton: Clips nach Lautstärke ausgewählt.")

    for i, c in enumerate(clips):
        report(f"Clip {i + 1}/{len(clips)} wird gerendert", 0.75 + 0.24 * i / max(1, len(clips)))
        out = workdir / f"clip_{i + 1:02d}.mp4"
        render_clip(video, c, words, out, layout, info, opts.get("cam", {}), opts.get("captions", True))
        c.file = out.name
    if opts.get("chat_messages"):
        note += f" Chat-Aktivität berücksichtigt ({opts['chat_messages']} Nachrichten)."
    elif opts.get("chat_error"):
        note += f" Chat-Datei konnte nicht gelesen werden: {opts['chat_error']}"
    report("Fertig", 1.0)
    return {"info": info, "note": note, "clips": [asdict(c) for c in clips]}
