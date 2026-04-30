"""
registry.py - Loads model and experiment configurations from disk.

The registry scans the models/ directory for vendor JSON files and the
experiments/ directory for experiment config.json files. It provides
lookup functions for the runner and UI.
"""

import json
import os
from pathlib import Path
from typing import Optional


def load_vendor_configs(models_dir: str) -> dict:
    """Load all vendor config files from the models directory.

    Returns a dict keyed by vendor name, each containing the full
    vendor config (api_base, auth_env_var, api_style, models list).
    """
    vendors = {}
    models_path = Path(models_dir)
    if not models_path.exists():
        return vendors

    for f in sorted(models_path.glob("*.json")):
        with open(f) as fh:
            config = json.load(fh)
        vendors[config["vendor"]] = config

    return vendors


def load_experiment_configs(experiments_dir: str) -> dict:
    """Load all experiment config.json files from the experiments directory.

    Returns a dict keyed by experiment name, each containing the full
    experiment config.
    """
    experiments = {}
    exp_path = Path(experiments_dir)
    if not exp_path.exists():
        return experiments

    for config_file in sorted(exp_path.glob("*/config.json")):
        with open(config_file) as fh:
            config = json.load(fh)
        config["_dir"] = str(config_file.parent)
        experiments[config["name"]] = config

    return experiments


def find_model(vendors: dict, model_id: str) -> Optional[dict]:
    """Find a model by ID across all vendors.

    Returns a dict with vendor config and model entry, or None.
    """
    for vendor_name, vendor_config in vendors.items():
        for model in vendor_config["models"]:
            if model["id"] == model_id:
                return {
                    "vendor": vendor_name,
                    "api_base": vendor_config["api_base"],
                    "auth_env_var": vendor_config["auth_env_var"],
                    "api_style": vendor_config["api_style"],
                    "model": model,
                }
    return None


def list_models_by_vendor(vendors: dict) -> list:
    """Return a flat list of models grouped by vendor for UI display.

    Each entry: {"vendor": str, "label": str, "id": str}
    """
    result = []
    for vendor_name, vendor_config in vendors.items():
        for model in vendor_config["models"]:
            result.append({
                "vendor": vendor_name,
                "label": model["label"],
                "id": model["id"],
            })
    return result
