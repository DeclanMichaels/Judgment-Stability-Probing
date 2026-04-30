#!/bin/bash
# view-report.sh - View the interactive report with zero dependencies.
#
# Uses Python's built-in http.server (no pip install needed).
# Opens the report in your default browser.
#
# Usage:
#   ./view-report.sh
#   ./view-report.sh 8080   # custom port

set -e

PORT="${1:-8080}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT_DIR="$SCRIPT_DIR/experiments/rcp-v2"

if [ ! -f "$REPORT_DIR/report-lite.json" ] && [ ! -f "$REPORT_DIR/report.json" ]; then
    echo "Error: No report data found in $REPORT_DIR"
    echo "Expected report-lite.json or report.json"
    exit 1
fi

echo "Starting report viewer at http://localhost:$PORT/report.html"
echo "Press Ctrl+C to stop."
echo ""

# Open browser after a short delay (background)
(sleep 1 && open "http://localhost:$PORT/report.html" 2>/dev/null || \
    xdg-open "http://localhost:$PORT/report.html" 2>/dev/null || \
    echo "Open http://localhost:$PORT/report.html in your browser") &

cd "$REPORT_DIR"
python3 -m http.server "$PORT"
