"""Run: python -m pytest -q   (from this folder). No video or model needed."""
import json

import numpy as np

import pipeline as pl


def words_at(spec):
    """spec: list of (start_second, text) -> Word list, 0.3 s per word."""
    out = []
    for t, text in spec:
        for k, w in enumerate(text.split()):
            out.append(pl.Word(t + 0.35 * k, t + 0.35 * k + 0.3, w))
    return out


def test_loudest_hype_moment_wins():
    dur = 120
    loud = np.zeros(int(dur / pl.HOP))
    loud[int(80 / pl.HOP):int(84 / pl.HOP)] = 3.0  # loud burst at 80 s
    words = words_at([(10 * i, "ganz normales Gerede über das Spiel heute") for i in range(12)]
                     + [(80, "Oh mein Gott! Alter, was war das? Clip das!")])
    best = pl.find_candidates(words, loud, dur, 10, 20, 1)[0]
    assert best.start <= 80 <= best.end and best.start >= 74  # hook near the start


def test_clips_do_not_overlap_and_respect_length():
    dur = 300
    rng = np.random.default_rng(1)
    loud = rng.normal(0, 1, int(dur / pl.HOP))
    words = words_at([(5 * i, "eins zwei drei vier fünf sechs") for i in range(60)])
    clips = pl.find_candidates(words, loud, dur, 15, 30, 5)
    assert len(clips) == 5
    spans = sorted((c.start, c.end) for c in clips)
    assert all(a[1] <= b[0] + 0.5 for a, b in zip(spans, spans[1:]))
    assert all(14.5 <= c.end - c.start <= 30.5 for c in clips)


def test_chat_spike_decides_when_audio_is_flat():
    dur = 120
    loud = np.zeros(int(dur / pl.HOP))
    words = words_at([(10 * i, "ganz normales Gerede über das Spiel") for i in range(12)])
    msgs = [(50 + pl.CHAT_DELAY + i * 0.1, "KEKW KEKW") for i in range(60)]  # chat storm reacting to 50 s
    chat = pl.chat_curve(msgs, len(loud))
    best = pl.find_candidates(words, loud, dur, 10, 20, 1, chat)[0]
    assert best.start <= 52 and best.end >= 50


def test_parse_chat_formats():
    js = json.dumps({"comments": [{"content_offset_seconds": 12.5, "message": {"body": "W"}}]}).encode()
    assert pl.parse_chat(js) == [(12.5, "W")]
    txt = "[0:01:05] user1: KEKW\n00:02:00 user2: clip it\nkaputte zeile\n[3:07] x: hi".encode()
    assert [t for t, _ in pl.parse_chat(txt)] == [65, 120, 187]


def test_caption_groups_fit_the_frame(tmp_path):
    w = words_at([(0, "Nicht ernsthaft! Unglaublich lange Wortkombination hier")])
    f = tmp_path / "c.ass"
    pl.write_ass(w, 0, 10, f, 1000)
    import re
    lines = {re.sub(r"\{[^}]*\}", "", l.split(",,", 2)[2]).strip()
             for l in f.read_text().splitlines() if l.startswith("Dialogue")}
    assert all(len(l) <= 30 for l in lines)
