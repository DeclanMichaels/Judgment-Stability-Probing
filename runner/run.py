"""
run.py - Core experiment runner.

Takes a model ID and experiment name, loads configs, iterates through
stimuli and prompt templates, sends calls via the appropriate provider,
invokes the experiment's parser, and writes result envelopes to disk.
"""

import asyncio
import importlib.util
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .registry import load_vendor_configs, load_experiment_configs, find_model
from .providers import create_provider


def _find_latest_run(project_root, experiment_name, vendor_model_dir):
    """Find the most recent run folder for a model+experiment."""
    base = os.path.join(project_root, "results", experiment_name, vendor_model_dir)
    if not os.path.exists(base):
        return None
    candidates = sorted(
        [d for d in os.listdir(base)
         if os.path.isdir(os.path.join(base, d)) and not d.startswith(".")],
        reverse=True,
    )
    if candidates:
        return os.path.join(base, candidates[0])
    return None


def _load_completed_keys(results_dir):
    """Read responses.jsonl and return set of (template, stimulus_id, iteration)
    for successfully completed calls (no API error)."""
    completed = set()
    resp_path = os.path.join(results_dir, "responses.jsonl")
    if not os.path.exists(resp_path):
        return completed
    with open(resp_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                env = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Only count as completed if no API error
            if env.get("meta", {}).get("error"):
                continue
            key = (
                env.get("prompt_template", ""),
                env.get("stimulus_id", ""),
                env.get("iteration", 0),
            )
            completed.add(key)
    return completed


def _load_parser(experiment_dir: str):
    """Dynamically load the experiment's parse.py module."""
    parse_path = os.path.join(experiment_dir, "parse.py")
    if not os.path.exists(parse_path):
        raise FileNotFoundError(f"No parse.py found in {experiment_dir}")

    spec = importlib.util.spec_from_file_location("parse", parse_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if not hasattr(module, "parse"):
        raise AttributeError(f"parse.py in {experiment_dir} has no parse() function")

    return module.parse


def _load_stimuli(experiment_config: dict) -> list:
    """Load the stimuli file referenced by the experiment config."""
    exp_dir = experiment_config["_dir"]
    stimuli_path = os.path.join(exp_dir, experiment_config["stimuli_path"])

    with open(stimuli_path) as f:
        return json.load(f)


def _load_template(experiment_config: dict, template_name: str) -> str:
    """Load a prompt template file."""
    exp_dir = experiment_config["_dir"]
    template_path = os.path.join(
        exp_dir, experiment_config["prompt_templates"][template_name]
    )

    with open(template_path) as f:
        return f.read()


def _render_prompt(template: str, stimulus: dict) -> str:
    """Render a prompt template with stimulus data.

    Template uses {field_name} placeholders that map to stimulus keys.
    """
    result = template
    for key, value in stimulus.items():
        result = result.replace(f"{{{key}}}", str(value))
    return result


RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 529}
MAX_RETRIES = 3
BACKOFF_BASE = 2.0


async def _send_with_retry(provider, prompt, temperature, max_tokens):
    """Send a message with retry and exponential backoff for rate limits."""
    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return await provider.send_message(
                prompt=prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as e:
            last_error = e
            # Check if this is a retryable HTTP error
            error_str = str(e)
            is_retryable = False
            for code in RETRYABLE_STATUS_CODES:
                if str(code) in error_str:
                    is_retryable = True
                    break

            if is_retryable and attempt < MAX_RETRIES:
                wait = BACKOFF_BASE * (2 ** attempt)
                await asyncio.sleep(wait)
                continue
            else:
                raise last_error


async def run_experiment(
    project_root: str,
    experiment_name: str,
    model_id: str,
    templates: Optional[list] = None,
    iterations: Optional[int] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    progress_callback=None,
    is_cancelled=None,
    resume: bool = False,
) -> dict:
    """Run an experiment against a model.

    Args:
        project_root: Path to the -Experiment-Platform- directory.
        experiment_name: Name matching an experiments/{name}/ folder.
        model_id: Full model ID from the registry.
        templates: Override which templates to run (default: all).
        iterations: Override iteration count (default: from config).
        temperature: Override temperature (default: from config).
        max_tokens: Override max_tokens (default: from config).
        progress_callback: Optional callable(current, total, message).
        is_cancelled: Optional callable() -> bool. Checked between API calls.
        resume: If True, find the latest run for this model and skip
            already-completed calls. Appends to existing responses.jsonl.

    Returns:
        Run metadata dict.
    """
    # Load configs
    vendors = load_vendor_configs(os.path.join(project_root, "models"))
    experiments = load_experiment_configs(os.path.join(project_root, "experiments"))

    if experiment_name not in experiments:
        raise ValueError(f"Experiment '{experiment_name}' not found")

    model_info = find_model(vendors, model_id)
    if model_info is None:
        raise ValueError(f"Model '{model_id}' not found in any vendor config")

    exp_config = experiments[experiment_name]
    params = exp_config.get("parameters", {})

    # Resolve parameters (argument overrides config)
    run_iterations = iterations or params.get("iterations", 1)
    run_temperature = temperature if temperature is not None else params.get("temperature", 0.7)
    run_max_tokens = max_tokens or params.get("max_tokens", 4096)
    run_templates = templates or list(exp_config.get("prompt_templates", {}).keys())
    delay_seconds = params.get("delay_seconds", 1.0)

    # Load experiment resources
    stimuli = _load_stimuli(exp_config)
    parse_fn = _load_parser(exp_config["_dir"])

    # Create provider
    #api_key = os.environ.get(model_info["auth_env_var"], "")
    #if not api_key:
    #    raise ValueError(
    #        f"API key not set. Set {model_info['auth_env_var']} in your environment."
    #    )
    auth_env = model_info.get("auth_env_var", "")
    api_key = os.environ.get(auth_env, "") if auth_env else ""
    if auth_env and not api_key:
        raise ValueError(
            f"API key not set. Set {auth_env} in your environment."
    )

    provider = create_provider(
        api_style=model_info["api_style"],
        api_base=model_info["api_base"],
        api_key=api_key,
        model_id=model_id,
        extra_body=model_info["model"].get("extra_body"),
    )

    # Prepare output directory
    vendor_model_dir = f"{model_info['vendor']}_{model_id.replace('/', '_')}"

    # Resume: find existing run folder and load completed keys
    completed_keys = set()
    if resume:
        existing_dir = _find_latest_run(project_root, experiment_name, vendor_model_dir)
        if existing_dir:
            completed_keys = _load_completed_keys(existing_dir)
            results_dir = existing_dir
        else:
            # No existing run to resume; start fresh
            resume = False

    if not resume:
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
        results_dir = os.path.join(
            project_root, "results", experiment_name, vendor_model_dir, timestamp
        )
    os.makedirs(results_dir, exist_ok=True)

    # Calculate totals
    total_calls = len(stimuli) * len(run_templates) * run_iterations
    already_done = len(completed_keys)
    remaining = total_calls - already_done
    completed = already_done
    parse_failures = 0
    api_errors = 0
    retries_used = 0
    run_start = datetime.now(timezone.utc)

    results_file = os.path.join(results_dir, "responses.jsonl")
    file_mode = "a" if resume and completed_keys else "w"

    with open(results_file, file_mode) as out:
        for iteration in range(1, run_iterations + 1):
            for template_name in run_templates:
                template_text = _load_template(exp_config, template_name)

                for stimulus in stimuli:
                    prompt_text = _render_prompt(template_text, stimulus)
                    stimulus_id = stimulus.get("id", stimulus.get("probe_id", "unknown"))

                    # Skip if already completed (resume mode)
                    call_key = (template_name, stimulus_id, iteration)
                    if call_key in completed_keys:
                        continue

                    # Build envelope (everything except parsed)
                    envelope = {
                        "experiment": experiment_name,
                        "model": model_id,
                        "vendor": model_info["vendor"],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "stimulus_id": stimulus_id,
                        "stimulus_text": prompt_text,
                        "prompt_template": template_name,
                        "iteration": iteration,
                        "raw_response": "",
                        "parsed": {},
                        "meta": {
                            "tokens_in": 0,
                            "tokens_out": 0,
                            "latency_ms": 0,
                            "temperature": run_temperature,
                            "max_tokens": run_max_tokens,
                        },
                    }

                    try:
                        response = await _send_with_retry(
                            provider,
                            prompt=prompt_text,
                            temperature=run_temperature,
                            max_tokens=run_max_tokens,
                        )

                        envelope["raw_response"] = response.text
                        envelope["meta"]["tokens_in"] = response.tokens_in
                        envelope["meta"]["tokens_out"] = response.tokens_out
                        envelope["meta"]["latency_ms"] = response.latency_ms

                        try:
                            parsed = parse_fn(response.text, stimulus, template_name)
                            envelope["parsed"] = parsed
                        except Exception as e:
                            envelope["parsed"] = {"_parse_error": str(e)}
                            parse_failures += 1

                    except Exception as e:
                        envelope["raw_response"] = ""
                        envelope["meta"]["error"] = str(e)
                        api_errors += 1

                    out.write(json.dumps(envelope) + "\n")
                    out.flush()

                    completed += 1
                    if progress_callback:
                        progress_callback(
                            completed,
                            total_calls,
                            f"{template_name} / {stimulus_id} / iter {iteration}",
                        )

                    # Check for cancellation
                    if is_cancelled and is_cancelled():
                        break

                    # Rate limit: wait between calls
                    if completed < total_calls:
                        await asyncio.sleep(delay_seconds)

                if is_cancelled and is_cancelled():
                    break
            if is_cancelled and is_cancelled():
                break

    run_end = datetime.now(timezone.utc)

    # Write run metadata
    run_meta = {
        "experiment": experiment_name,
        "model": model_id,
        "vendor": model_info["vendor"],
        "started": run_start.isoformat(),
        "completed": run_end.isoformat(),
        "cancelled": bool(is_cancelled and is_cancelled()),
        "resumed": bool(completed_keys),
        "resumed_from": already_done if completed_keys else 0,
        "parameters": {
            "iterations": run_iterations,
            "temperature": run_temperature,
            "max_tokens": run_max_tokens,
            "templates_used": run_templates,
            "delay_seconds": delay_seconds,
        },
        "counts": {
            "stimuli": len(stimuli),
            "templates": len(run_templates),
            "iterations": run_iterations,
            "expected_responses": total_calls,
            "actual_responses": completed - api_errors,
            "parse_failures": parse_failures,
            "api_errors": api_errors,
        },
    }

    with open(os.path.join(results_dir, "run_meta.json"), "w") as f:
        json.dump(run_meta, f, indent=2)

    return run_meta
