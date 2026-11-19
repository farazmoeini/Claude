"""StreamCut web server. Run:  uvicorn app:app --port 8000   (from this folder)"""
from __future__ import annotations

import json
import shutil
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import pipeline

ROOT = Path(__file__).parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

app = FastAPI(title="StreamCut")
executor = ThreadPoolExecutor(max_workers=1)  # one render at a time; CPU bound
lock = threading.Lock()
jobs: dict[str, dict] = {}


def save(job_id: str) -> None:
    with lock:
        (DATA / job_id / "job.json").write_text(json.dumps(jobs[job_id], ensure_ascii=False, indent=1))


def load_existing() -> None:
    for f in DATA.glob("*/job.json"):
        try:
            j = json.loads(f.read_text())
            if j.get("status") in ("queued", "running"):
                j["status"], j["error"] = "error", "Server wurde neu gestartet."
            jobs[j["id"]] = j
        except Exception:
            pass


load_existing()


def worker(job_id: str, video: Path, opts: dict) -> None:
    job = jobs[job_id]
    job["status"] = "running"

    def report(stage: str, p: float) -> None:
        job["stage"], job["progress"] = stage, round(p, 3)
        save(job_id)

    try:
        result = pipeline.process(video, DATA / job_id, opts, report)
        job.update(status="done", result=result)
    except Exception as e:
        traceback.print_exc()
        job.update(status="error", error=str(e)[:1000])
    save(job_id)


@app.post("/api/jobs")
async def create_job(
    file: UploadFile = File(...),
    layout: str = Form("center"),
    num_clips: int = Form(5),
    min_len: float = Form(20),
    max_len: float = Form(50),
    language: str = Form("de"),
    captions: bool = Form(True),
    cam_x: float = Form(0.0), cam_y: float = Form(0.0), cam_w: float = Form(0.3), cam_h: float = Form(0.3),
):
    if layout not in ("center", "split", "blur"):
        raise HTTPException(400, "layout muss center, split oder blur sein")
    if not (5 <= min_len < max_len <= 180):
        raise HTTPException(400, "Länge: 5 ≤ min < max ≤ 180 Sekunden")
    num_clips = max(1, min(20, num_clips))
    job_id = uuid.uuid4().hex[:10]
    d = DATA / job_id
    d.mkdir(parents=True)
    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    video = d / f"source{suffix}"
    with video.open("wb") as fh:
        shutil.copyfileobj(file.file, fh, length=16 * 1024 * 1024)
    opts = dict(layout=layout, num_clips=num_clips, min_len=min_len, max_len=max_len,
                language=language if language != "auto" else None, captions=captions,
                cam=dict(x=cam_x, y=cam_y, w=cam_w, h=cam_h))
    jobs[job_id] = dict(id=job_id, filename=file.filename, status="queued", stage="In Warteschlange",
                        progress=0.0, opts=opts)
    save(job_id)
    executor.submit(worker, job_id, video, opts)
    return {"id": job_id}


@app.get("/api/jobs")
def list_jobs():
    return sorted(jobs.values(), key=lambda j: j["id"], reverse=True)


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job nicht gefunden")
    return jobs[job_id]


@app.get("/media/{job_id}/{name}")
def media(job_id: str, name: str):
    if job_id not in jobs or "/" in name or not name.startswith("clip_"):
        raise HTTPException(404)
    p = DATA / job_id / name
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p)


app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")
