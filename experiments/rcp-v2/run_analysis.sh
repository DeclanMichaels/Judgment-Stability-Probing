#!/bin/bash
# run_analysis.sh - Run the full RCP V2 analysis pipeline.
#
# Builds the report from raw response data (including permutation tests
# and PCA), then splits into report-lite.json + explanations.json.
#
# All output for a given temperature goes in one directory:
#   analysis/rcp-v2-temp07/  (or temp0)
#     report.json         Full report with all sections
#     report-lite.json    Report without explanation data (for viewer)
#     explanations.json   Explanation data (lazy-loaded by viewer)
#
# Usage:
#   cd experiments/rcp-v2
#   ./run_analysis.sh                    # temp 0.7 (stochastic, default)
#   ./run_analysis.sh --temperature 0    # temp 0 (deterministic)
#   ./run_analysis.sh --clean            # remove previous output first
#
# Prerequisites:
#   - Raw response data in ../../results/rcp-v2/
#   - Python venv at ~/.experiment-platform/venv

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$HOME/.experiment-platform/venv"
PYTHON="$VENV/bin/python"
PROJECT_ROOT="$SCRIPT_DIR/../.."

# Parse arguments
TEMPERATURE="0.7"
CLEAN=false

while [ $# -gt 0 ]; do
    case "$1" in
        --temperature)
            TEMPERATURE="$2"
            shift 2
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Usage: ./run_analysis.sh [--temperature 0|0.7] [--clean]"
            exit 1
            ;;
    esac
done

# All output for this temperature in one directory
if [ "$TEMPERATURE" = "0" ] || [ "$TEMPERATURE" = "0.0" ]; then
    OUT_DIR="$SCRIPT_DIR/analysis/rcp-v2-temp0"
else
    OUT_DIR="$SCRIPT_DIR/analysis/rcp-v2-temp07"
fi

REPORT_FILE="$OUT_DIR/report.json"
REPORT_LITE="$OUT_DIR/report-lite.json"

# Clean if requested
if [ "$CLEAN" = true ]; then
    echo "Cleaning previous output..."
    rm -rf "$OUT_DIR"
fi

# Check prerequisites
if [ ! -x "$PYTHON" ]; then
    echo "Error: Python not found at $PYTHON"
    echo "Run ./start.sh --fresh from the project root to create the venv."
    exit 1
fi

echo "============================================================"
echo "RCP V2 Analysis Pipeline"
echo "Temperature: $TEMPERATURE"
echo "Output: $OUT_DIR"
echo "============================================================"

# Build report (includes all analysis: drift, compliance, permutation
# tests, PCA, Procrustes, variance, and explanation viewer)
echo ""
echo "--- Building report (includes permutation tests and PCA) ---"
echo "    Permutation tests: 50,000 shuffles per model per test"
echo "    This will take several minutes."
echo ""
mkdir -p "$OUT_DIR"
"$PYTHON" "$SCRIPT_DIR/build_report.py" "$PROJECT_ROOT" \
    --temperature "$TEMPERATURE" \
    --output "$REPORT_FILE"

# Verify split produced report-lite.json
if [ ! -f "$REPORT_LITE" ]; then
    echo "Error: report-lite.json not found after build. Check split_report.py."
    exit 1
fi

# Summary
echo ""
echo "============================================================"
echo "Pipeline complete. Output files:"
echo "  $REPORT_FILE"
echo "  $REPORT_LITE"
echo "  $OUT_DIR/explanations.json"
echo "============================================================"
