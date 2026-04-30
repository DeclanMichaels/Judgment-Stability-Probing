#!/bin/bash
# start.sh - Bootstrap and run the Experiment Platform
#
# Creates a virtual environment, installs dependencies, and starts the server.
# Run from the -Experiment-Platform- directory:
#   ./start.sh
#
# First run creates the venv. Subsequent runs reuse it.
# To force reinstall: ./start.sh --fresh
#
# The venv lives at ~/.experiment-platform/venv (not in iCloud,
# which strips symlinks from bin/).

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export EXPERIMENT_PLATFORM_HOME="$SCRIPT_DIR"
VENV_DIR="$HOME/.experiment-platform/venv"

# Handle --fresh flag
if [ "$1" = "--fresh" ] && [ -d "$VENV_DIR" ]; then
    echo "Removing existing venv..."
    rm -rf "$VENV_DIR"
fi

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment at $VENV_DIR..."
    mkdir -p "$(dirname "$VENV_DIR")"
    python3 -m venv "$VENV_DIR"
    echo "Installing dependencies..."
    "$VENV_DIR/bin/pip" install --upgrade pip -q
    "$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" -q
    echo "Done."
fi

# Check for .env
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo ""
    echo "WARNING: No .env file found."
    echo "Copy .env.example to .env and add your API keys:"
    echo "  cp .env.example .env"
    echo ""
fi

# Determine port (standalone.json overrides default 8000)
PORT=8000
TITLE="Experiment Platform"
if [ -f "$SCRIPT_DIR/standalone.json" ]; then
    # Read port and title from standalone config (lightweight JSON parse)
    PORT=$(python3 -c "import json; print(json.load(open('$SCRIPT_DIR/standalone.json')).get('port', 8000))" 2>/dev/null || echo 8000)
    TITLE=$(python3 -c "import json; print(json.load(open('$SCRIPT_DIR/standalone.json')).get('title', 'Experiment Platform'))" 2>/dev/null || echo "Experiment Platform")
fi

echo "Starting $TITLE at http://0.0.0.0:$PORT"
echo "Accessible on local network. Press Ctrl+C to stop."
echo ""

cd "$SCRIPT_DIR"
"$VENV_DIR/bin/uvicorn" server:app --host 0.0.0.0 --port $PORT
