#!/usr/bin/env python3
"""
split_report.py - Split report.json into report-lite.json + explanations.json.

report-lite.json: All analysis sections, explanation_viewer section has count
                  and metadata only (no data array). Used by the dashboard.
explanations.json: Just the explanation data array. Lazy-loaded by the viewer.

Usage:
    python split_report.py path/to/report.json
    python split_report.py path/to/output_dir/  (looks for report.json inside)
"""
import json
import os
import sys


def split_report(report_path):
    """Split a report.json into report-lite.json and explanations.json.

    Output files are written to the same directory as the input report.
    Returns (lite_path, explanations_path) on success.
    """
    # If given a directory, look for report.json inside it
    if os.path.isdir(report_path):
        # Try common names
        for name in ["rcp-v2-temp07", "rcp-v2-temp0", "report.json"]:
            candidate = os.path.join(report_path, name)
            if os.path.exists(candidate):
                report_path = candidate
                break
        else:
            # Look for any file that looks like a report
            for f in os.listdir(report_path):
                if f.endswith(".json") and "lite" not in f and "explanations" not in f:
                    report_path = os.path.join(report_path, f)
                    break

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
            print(f"  Extracted {section['count']:,} explanations from primary sections")
            break

    # Also strip explanations from sections_by_temperature
    if "sections_by_temperature" in report:
        for temp_key, temp_data in report["sections_by_temperature"].items():
            for section in temp_data.get("sections", []):
                if section.get("type") == "explanation_viewer":
                    section["data"] = []
                    section["data_file"] = "explanations.json"
                    print(f"  Stripped explanations from temperature {temp_key}")

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
    print(f"  Lite:     {lite_size:>12,} bytes ({lite_size/orig_size*100:.1f}%)")
    print(f"  Explan:   {exp_size:>12,} bytes ({exp_size/orig_size*100:.1f}%)")

    return lite_path, exp_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python split_report.py <report.json or directory>")
        sys.exit(1)

    try:
        split_report(sys.argv[1])
        print("Done.")
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
