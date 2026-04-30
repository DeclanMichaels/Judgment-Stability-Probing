"""
server.py - FastAPI server for the Experiment Platform.

Provides REST endpoints for the UI to list models, list experiments,
start runs, and stream progress via server-sent events.

Usage:
    cd -Experiment-Platform-
    uvicorn server:app --reload --port 8000
"""

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from runner.registry import (
    load_vendor_configs,
    load_experiment_configs,
    find_model,
    list_models_by_vendor,
)
from runner.run import run_experiment
from runner.review_routes import review_router, init_review

# Load .env file if present (override=True ensures .env wins over
# stale values already in the shell environment)
load_dotenv(override=True)

# Project root is the directory containing this file
PROJECT_ROOT = str(Path(__file__).parent)

app = FastAPI(title="Experiment Platform", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Shared config loaded once at startup
# ---------------------------------------------------------------------------

_vendors = load_vendor_configs(os.path.join(PROJECT_ROOT, "models"))
init_review(PROJECT_ROOT, _vendors)
app.include_router(review_router)

# Standalone mode (single-experiment packaging)
_standalone = None
_standalone_path = Path(PROJECT_ROOT) / "standalone.json"
if _standalone_path.exists():
    with open(_standalone_path) as f:
        _standalone = json.load(f)

# ---------------------------------------------------------------------------
# In-memory run tracking
# ---------------------------------------------------------------------------

runs: dict = {}


class RunStatus:
    """Tracks the state of a single run."""

    def __init__(self, run_id: str, experiment: str, model: str):
        self.run_id = run_id
        self.experiment = experiment
        self.model = model
        self.status = "pending"
        self.current = 0
        self.total = 0
        self.message = ""
        self.result = None
        self.error = None
        self.cancelled = False
        self.events: asyncio.Queue = asyncio.Queue()

    def cancel(self):
        self.cancelled = True
        self.status = "cancelled"
        self.events.put_nowait({"type": "cancelled", "message": "Run cancelled by user"})

    def is_cancelled(self):
        return self.cancelled

    def progress(self, current, total, message):
        self.current = current
        self.total = total
        self.message = message
        self.status = "running"
        self.events.put_nowait({
            "type": "progress",
            "current": current,
            "total": total,
            "message": message,
        })

    def complete(self, result):
        self.status = "completed"
        self.result = result
        self.events.put_nowait({"type": "complete", "result": result})

    def fail(self, error):
        self.status = "failed"
        self.error = str(error)
        self.events.put_nowait({"type": "error", "error": str(error)})


class RunRequest(BaseModel):
    experiment: str
    model_id: str
    templates: Optional[list[str]] = None
    iterations: Optional[int] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    resume: bool = False


class SetupRequest(BaseModel):
    keys: dict[str, str]  # env_var_name -> api_key_value


class AddModelRequest(BaseModel):
    vendor: str
    model_id: str
    label: str
    max_tokens: int = 4096
    supports_temperature: bool = True


class DeleteRunRequest(BaseModel):
    run_dir: str  # Full path to the timestamp directory


class AnalyzeRequest(BaseModel):
    experiment: str
    temperature: Optional[float] = None  # None = prefer temp 0


class TestModelRequest(BaseModel):
    vendor: str
    model_id: Optional[str] = None  # If None, uses first model in vendor config
    api_key: Optional[str] = None   # If None, uses key from .env


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/standalone")
def get_standalone():
    """Return standalone config if present, or null."""
    return {"standalone": _standalone}


@app.get("/api/models")
def get_models():
    """List all models grouped by vendor."""
    by_vendor = {}
    for vendor_name, vendor_config in _vendors.items():
        by_vendor[vendor_name] = [
            {"id": m["id"], "label": m["label"]}
            for m in vendor_config["models"]
        ]
    return {"vendors": by_vendor}


@app.get("/api/experiments")
def get_experiments():
    """List all available experiments with stimuli counts."""
    experiments = load_experiment_configs(
        os.path.join(PROJECT_ROOT, "experiments")
    )
    result = []
    for name, config in experiments.items():
        stimuli_count = 0
        stimuli_path = os.path.join(config["_dir"], config.get("stimuli_path", ""))
        if os.path.exists(stimuli_path):
            with open(stimuli_path) as f:
                stimuli_count = len(json.load(f))

        result.append({
            "name": name,
            "description": config.get("description", ""),
            "version": config.get("version", ""),
            "templates": list(config.get("prompt_templates", {}).keys()),
            "parameters": config.get("parameters", {}),
            "stimuli_count": stimuli_count,
        })
    return {"experiments": result}


# ---------------------------------------------------------------------------
# Setup & Model Management
# ---------------------------------------------------------------------------

@app.get("/api/setup/status")
def setup_status():
    """Check which vendor API keys are configured."""
    env_path = Path(PROJECT_ROOT) / ".env"
    has_env = env_path.exists()

    vendor_status = {}
    for vendor_name, vendor_config in _vendors.items():
        env_var = vendor_config.get("auth_env_var", "")
        has_key = bool(os.environ.get(env_var, "").strip())
        vendor_status[vendor_name] = {
            "env_var": env_var,
            "configured": has_key,
            "model_count": len(vendor_config.get("models", [])),
        }

    any_configured = any(v["configured"] for v in vendor_status.values())
    return {
        "has_env_file": has_env,
        "any_configured": any_configured,
        "vendors": vendor_status,
    }


@app.post("/api/setup")
def save_setup(req: SetupRequest):
    """Write or update .env with provided API keys."""
    env_path = Path(PROJECT_ROOT) / ".env"

    # Read existing .env lines (preserve any non-key entries)
    existing = {}
    other_lines = []
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            stripped = line.strip()
            if "=" in stripped and not stripped.startswith("#"):
                key, _, val = stripped.partition("=")
                existing[key.strip()] = val.strip()
            else:
                other_lines.append(line)

    # Always record the platform home directory
    existing["EXPERIMENT_PLATFORM_HOME"] = PROJECT_ROOT

    # Merge new keys (only overwrite if non-empty)
    for env_var, api_key in req.keys.items():
        api_key = api_key.strip()
        if api_key:
            existing[env_var] = api_key

    # Write back
    lines = other_lines[:]
    if lines and lines[-1].strip():
        lines.append("")  # blank separator
    for key, val in sorted(existing.items()):
        lines.append(f"{key}={val}")
    lines.append("")  # trailing newline
    env_path.write_text("\n".join(lines))

    # Reload into current process environment
    load_dotenv(override=True)

    return {"status": "saved", "configured": list(k for k, v in existing.items() if v)}


@app.post("/api/models/test")
async def test_model(req: TestModelRequest):
    """Test connectivity to a model with a simple prompt."""
    from runner.providers import create_provider

    if req.vendor not in _vendors:
        raise HTTPException(status_code=400, detail=f"Unknown vendor: {req.vendor}")

    vendor_config = _vendors[req.vendor]
    api_key = req.api_key or os.environ.get(vendor_config["auth_env_var"], "")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key provided and {vendor_config['auth_env_var']} not set in .env",
        )

    # Determine which model to test
    model_id = req.model_id
    if not model_id:
        models = vendor_config.get("models", [])
        if not models:
            raise HTTPException(status_code=400, detail=f"No models configured for {req.vendor}")
        model_id = models[0]["id"]

    try:
        provider = create_provider(
            api_style=vendor_config["api_style"],
            api_base=vendor_config["api_base"],
            api_key=api_key,
            model_id=model_id,
        )
        response = await provider.send_message(
            prompt="Reply with exactly: OK",
            temperature=0,
            max_tokens=10,
        )
        return {
            "status": "ok",
            "model_id": model_id,
            "vendor": req.vendor,
            "response": response.text[:100],
            "latency_ms": response.latency_ms,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Test failed: {str(e)}")


@app.post("/api/models")
def add_model(req: AddModelRequest):
    """Add a model to an existing vendor config file."""
    vendor_file = Path(PROJECT_ROOT) / "models" / f"{req.vendor}.json"
    if not vendor_file.exists():
        raise HTTPException(status_code=400, detail=f"Unknown vendor: {req.vendor}")

    with open(vendor_file) as f:
        config = json.load(f)

    # Check for duplicate
    for m in config["models"]:
        if m["id"] == req.model_id:
            raise HTTPException(status_code=400, detail=f"Model already exists: {req.model_id}")

    config["models"].append({
        "id": req.model_id,
        "label": req.label,
        "max_tokens": req.max_tokens,
        "supports_temperature": req.supports_temperature,
    })

    with open(vendor_file, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    # Reload vendor configs
    global _vendors
    _vendors = load_vendor_configs(os.path.join(PROJECT_ROOT, "models"))

    return {"status": "added", "vendor": req.vendor, "model_id": req.model_id}


@app.delete("/api/models/{vendor}/{model_id:path}")
def remove_model(vendor: str, model_id: str):
    """Remove a model from a vendor config file."""
    vendor_file = Path(PROJECT_ROOT) / "models" / f"{vendor}.json"
    if not vendor_file.exists():
        raise HTTPException(status_code=404, detail=f"Unknown vendor: {vendor}")

    with open(vendor_file) as f:
        config = json.load(f)

    original_count = len(config["models"])
    config["models"] = [m for m in config["models"] if m["id"] != model_id]

    if len(config["models"]) == original_count:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_id}")

    with open(vendor_file, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    global _vendors
    _vendors = load_vendor_configs(os.path.join(PROJECT_ROOT, "models"))

    return {"status": "removed", "vendor": vendor, "model_id": model_id}


@app.post("/api/runs")
async def start_run(req: RunRequest):
    """Start an experiment run. Returns a run_id for progress tracking."""
    vendors = load_vendor_configs(os.path.join(PROJECT_ROOT, "models"))
    model_info = find_model(vendors, req.model_id)
    if model_info is None:
        raise HTTPException(status_code=400, detail=f"Unknown model: {req.model_id}")

    experiments = load_experiment_configs(
        os.path.join(PROJECT_ROOT, "experiments")
    )
    if req.experiment not in experiments:
        raise HTTPException(
            status_code=400, detail=f"Unknown experiment: {req.experiment}"
        )

    #api_key = os.environ.get(model_info["auth_env_var"], "")
    #if not api_key:
    #raise HTTPException(
    #        status_code=400,
    #        detail=f"API key not configured. Set {model_info['auth_env_var']} in
    # .env",
    #    )
    
    auth_env = model_info.get("auth_env_var", "")
    api_key = os.environ.get(auth_env, "") if auth_env else ""
    if auth_env and not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"API key not configured. Set {auth_env} in .env",
    )

    run_id = str(uuid.uuid4())[:8]
    status = RunStatus(run_id, req.experiment, req.model_id)
    runs[run_id] = status

    async def execute():
        try:
            status.status = "running"
            result = await run_experiment(
                project_root=PROJECT_ROOT,
                experiment_name=req.experiment,
                model_id=req.model_id,
                templates=req.templates,
                iterations=req.iterations,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
                progress_callback=status.progress,
                is_cancelled=status.is_cancelled,
                resume=req.resume,
            )
            if status.cancelled:
                status.events.put_nowait({"type": "complete", "result": result})
            else:
                status.complete(result)
        except Exception as e:
            status.fail(e)

    asyncio.create_task(execute())

    return {"run_id": run_id, "status": "started"}


@app.post("/api/runs/{run_id}/cancel")
def cancel_run(run_id: str):
    """Cancel a running experiment."""
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")
    s = runs[run_id]
    if s.status not in ("pending", "running"):
        return {"run_id": run_id, "status": s.status, "message": "Run already finished"}
    s.cancel()
    return {"run_id": run_id, "status": "cancelled"}


@app.get("/api/runs/{run_id}")
def get_run_status(run_id: str):
    """Get the current status of a run."""
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")
    s = runs[run_id]
    return {
        "run_id": s.run_id,
        "experiment": s.experiment,
        "model": s.model,
        "status": s.status,
        "current": s.current,
        "total": s.total,
        "message": s.message,
        "result": s.result,
        "error": s.error,
    }


@app.get("/api/runs/{run_id}/stream")
async def stream_run_progress(run_id: str):
    """Stream run progress as server-sent events."""
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")

    status = runs[run_id]

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(status.events.get(), timeout=30.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event["type"] in ("complete", "error", "cancelled"):
                    break
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.get("/api/results")
def list_results():
    """List all stored results."""
    results_dir = Path(PROJECT_ROOT) / "results"
    if not results_dir.exists():
        return {"results": []}

    result_list = []
    for exp_dir in sorted(results_dir.iterdir()):
        if not exp_dir.is_dir():
            continue
        for model_dir in sorted(exp_dir.iterdir()):
            if not model_dir.is_dir():
                continue
            for ts_dir in sorted(model_dir.iterdir()):
                if not ts_dir.is_dir():
                    continue
                meta_path = ts_dir / "run_meta.json"
                if meta_path.exists():
                    with open(meta_path) as f:
                        meta = json.load(f)
                    result_list.append(meta)

    return {"results": result_list}


@app.post("/api/runs/delete")
def delete_run(req: DeleteRunRequest):
    """Delete a specific run's result directory."""
    import shutil
    run_path = Path(req.run_dir)
    results_root = Path(PROJECT_ROOT) / "results"

    # Safety: must be under results directory
    try:
        run_path.resolve().relative_to(results_root.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path: not under results directory")

    if not run_path.exists():
        raise HTTPException(status_code=404, detail="Run directory not found")

    if not (run_path / "run_meta.json").exists():
        raise HTTPException(status_code=400, detail="Not a valid run directory (no run_meta.json)")

    shutil.rmtree(run_path)

    # Clean up empty parent (model dir) if no runs remain
    parent = run_path.parent
    if parent.exists() and not any(d.is_dir() for d in parent.iterdir() if not d.name.startswith(".")):
        shutil.rmtree(parent)

    return {"status": "deleted", "path": str(run_path)}


@app.get("/api/reports")
async def list_reports():
    """List experiments with available reports and result runs."""
    reports = []
    exp_dir = Path(PROJECT_ROOT) / "experiments"
    results_dir = Path(PROJECT_ROOT) / "results"

    if not exp_dir.exists():
        return {"reports": []}

    for exp_path in sorted(exp_dir.iterdir()):
        if not exp_path.is_dir() or exp_path.name.startswith("."):
            continue

        entry = {
            "experiment": exp_path.name,
            "has_report": (exp_path / "report.html").exists(),
            "has_scorer": (exp_path / "scorer.html").exists(),
            "has_build_report": (exp_path / "build_report.py").exists(),
            "report_url": f"/reports/{exp_path.name}/report.html" if (exp_path / "report.html").exists() else None,
            "scorer_url": f"/reports/{exp_path.name}/scorer.html" if (exp_path / "scorer.html").exists() else None,
            "runs": [],
        }

        # Find result runs for this experiment
        exp_results = results_dir / exp_path.name
        if exp_results.exists():
            for model_dir in sorted(exp_results.iterdir()):
                if not model_dir.is_dir() or model_dir.name.startswith("."):
                    continue
                for ts_dir in sorted(model_dir.iterdir(), reverse=True):
                    meta_path = ts_dir / "run_meta.json"
                    if meta_path.exists():
                        with open(meta_path) as f:
                            meta = json.load(f)
                        entry["runs"].append({
                            "model": meta["model"],
                            "vendor": meta["vendor"],
                            "completed": meta.get("completed", ""),
                            "timestamp": ts_dir.name,
                            "temperature": meta["parameters"].get("temperature"),
                            "iterations": meta["parameters"].get("iterations", 1),
                            "templates": len(meta["parameters"]["templates_used"]),
                            "responses": meta["counts"]["actual_responses"],
                            "expected": meta["counts"].get("expected_responses", 0),
                            "parse_failures": meta["counts"].get("parse_failures", 0),
                            "run_dir": str(ts_dir),
                        })

        if entry["has_report"] or entry["has_scorer"] or entry["runs"]:
            reports.append(entry)

    return {"reports": reports}


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

@app.post("/api/analyze")
async def run_analysis(req: AnalyzeRequest):
    """Run build_report.py for an experiment. Streams progress via SSE."""
    exp_dir = Path(PROJECT_ROOT) / "experiments" / req.experiment
    build_script = exp_dir / "build_report.py"

    if not exp_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Experiment not found: {req.experiment}")
    if not build_script.exists():
        raise HTTPException(
            status_code=400,
            detail=f"No build_report.py found for {req.experiment}",
        )

    # Check that results exist
    results_dir = Path(PROJECT_ROOT) / "results" / req.experiment
    if not results_dir.exists() or not any(results_dir.iterdir()):
        raise HTTPException(
            status_code=400,
            detail=f"No results data for {req.experiment}. Run collection first.",
        )

    # Find the venv python
    venv_python = os.path.join(
        os.path.expanduser("~"), ".experiment-platform", "venv", "bin", "python3"
    )
    if not os.path.exists(venv_python):
        venv_python = "python3"  # Fallback to system python

    cmd = [venv_python, "-u", str(build_script), PROJECT_ROOT]
    if req.temperature is not None:
        cmd.extend(["--temperature", str(req.temperature)])

    async def stream_analysis():
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(exp_dir),
        )

        async for line in proc.stdout:
            text = line.decode("utf-8", errors="replace").rstrip()
            if text:
                event = {"type": "progress", "message": text}
                yield f"data: {json.dumps(event)}\n\n"

        await proc.wait()

        if proc.returncode == 0:
            # Check if report was generated
            report_path = exp_dir / "report.json"
            has_report = report_path.exists()

            event = {
                "type": "complete",
                "message": "Analysis complete",
                "has_report": has_report,
                "report_url": f"/reports/{req.experiment}/report.html" if (exp_dir / "report.html").exists() else None,
            }
            yield f"data: {json.dumps(event)}\n\n"
        else:
            event = {
                "type": "error",
                "message": f"Analysis failed with exit code {proc.returncode}",
            }
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        stream_analysis(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# Serve experiment reports at /reports/{experiment_name}/
experiments_dir = os.path.join(PROJECT_ROOT, "experiments")
if os.path.exists(experiments_dir):
    for exp_name in sorted(os.listdir(experiments_dir)):
        exp_dir = os.path.join(experiments_dir, exp_name)
        if not os.path.isdir(exp_dir):
            continue
        # Mount if any viewer HTML exists (report.html, scorer.html, etc.)
        has_viewer = any(
            os.path.exists(os.path.join(exp_dir, f))
            for f in ("report.html", "scorer.html")
        )
        if has_viewer:
            app.mount(
                f"/reports/{exp_name}",
                StaticFiles(directory=exp_dir, html=True),
                name=f"report-{exp_name}",
            )

# Serve UI static files (must be last to not shadow API routes)
ui_dir = os.path.join(PROJECT_ROOT, "ui")
if os.path.exists(ui_dir):
    app.mount("/", StaticFiles(directory=ui_dir, html=True), name="ui")
