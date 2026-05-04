#!/bin/bash
set -e
PORT="${1:-8080}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT_DIR="$SCRIPT_DIR/report"

if [ ! -f "$REPORT_DIR/report-lite.json" ] && [ ! -f "$REPORT_DIR/report.json" ]; then
    echo "Error: No report data found in $REPORT_DIR"
    exit 1
fi

echo "Starting report viewer at http://localhost:$PORT/report.html"
echo "Press Ctrl+C to stop."

(sleep 1 && open "http://localhost:$PORT/report.html" 2>/dev/null || \
    xdg-open "http://localhost:$PORT/report.html" 2>/dev/null || \
    echo "Open http://localhost:$PORT/report.html in your browser") &

cd "$REPORT_DIR"
python3 -m http.server "$PORT"
