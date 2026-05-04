#!/usr/bin/env python3
"""
split_report.py - Split report.json into report-lite.json + explanations.json.

report-lite.json: All analysis sections. The explanation_viewer section retains
                  its count and metadata but the data array is replaced with an
                  empty list and a data_file pointer. Used by the dashboard.
explanations.json: Just the explanation data array. Lazy-loaded by the viewer.

Usage:
    python split_report.py path/to/report.json

Outputs are written to the same directory as the input report.
"""

import json
import os
import sys


def split_report(report_path):
    """Split a report.json into report-lite.json and explanations.json.

    Args:
        report_path: Path to a report.json file.

    Returns:
        Tuple of (lite_path, explanations_path) on success.

    Raises:
        FileNotFoundError: If report_path does not exist.
    """
    if not os.path.exists(report_path):
        raise FileNotFoundError(f"Report not found: {report_path}")

    output_dir = os.path.dirname(os.path.abspath(report_path))

    print(f"Reading {report_path}...")
    with open(report_path) as f:
        report = json.load(f)

    explanations = None
    for section in report["sections"]:
        if section.get("type") == "explanation_viewer":
            explanations = section["data"]
            section["data"] = []
            section["data_file"] = "explanations.json"
            print(f"  Extracted {section['count']:,} explanations")
            break

    if explanations is None:
        print("No explanation_viewer section found. Writing lite copy without split.")
        explanations = []

    # Write lite report
    lite_path = os.path.join(output_dir, "report-lite.json")
    with open(lite_path, "w") as f:
        json.dump(report, f)
    lite_size = os.path.getsize(lite_path)
    print(f"  report-lite.json: {lite_size:,} bytes")

    # Write explanations
    exp_path = os.path.join(output_dir, "explanations.json")
    with open(exp_path, "w") as f:
        json.dump(explanations, f)
    exp_size = os.path.getsize(exp_path)
    print(f"  explanations.json: {exp_size:,} bytes")

    orig_size = os.path.getsize(report_path)
    print(f"\n  Original: {orig_size:>12,} bytes")
    print(f"  Lite:     {lite_size:>12,} bytes ({lite_size / orig_size * 100:.1f}%)")
    print(f"  Explan:   {exp_size:>12,} bytes ({exp_size / orig_size * 100:.1f}%)")

    return lite_path, exp_path


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python split_report.py <report.json>")
        sys.exit(1)

    try:
        split_report(sys.argv[1])
        print("Done.")
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
