#!/bin/bash
# sync-from-platform.sh
# Syncs the standalone repo from the Experiment Platform.
# Run from the Claude.AI directory (the parent of both folders).
#
# Usage:
#   cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/Claude.AI
#   bash rcp-v2-standalone/sync-from-platform.sh

set -euo pipefail

PLATFORM="./-Experiment-Platform-"
STANDALONE="./rcp-v2-standalone"
EXP_P="$PLATFORM/experiments/rcp-v2"
EXP_S="$STANDALONE/experiments/rcp-v2"

echo "=== Syncing rcp-v2-standalone from Experiment Platform ==="
echo ""

# -----------------------------------------------------------------------
# 1. Report viewer files
# -----------------------------------------------------------------------
echo "1. Syncing report viewer files..."

cp "$EXP_P/report.html" "$EXP_S/report.html"

for f in report-app.js report-sections.js report-utils.js report.css; do
  cp "$EXP_P/reports/$f" "$EXP_S/reports/$f"
done

echo "   report.html + 4 viewer files synced."

# -----------------------------------------------------------------------
# 2. Pipeline files (build_report, config, parse, split_report, test)
# -----------------------------------------------------------------------
echo "2. Syncing pipeline files..."

for f in build_report.py config.json parse.py split_report.py test_build_report.py; do
  if [ -f "$EXP_P/$f" ]; then
    cp "$EXP_P/$f" "$EXP_S/$f"
    echo "   $f synced."
  else
    echo "   $f not found in Platform, skipping."
  fi
done

# Stimuli
echo "   Syncing stimuli..."
rsync -a --delete "$EXP_P/stimuli/" "$EXP_S/stimuli/"
echo "   stimuli/ synced."

# Analysis scripts (not the data subdirs or venvs)
echo "   Syncing analysis scripts..."
for f in factor_analysis.py permutation_tests.py embedding_validation.py; do
  if [ -f "$EXP_P/analysis/$f" ]; then
    cp "$EXP_P/analysis/$f" "$EXP_S/analysis/$f"
    echo "   analysis/$f synced."
  fi
done

# -----------------------------------------------------------------------
# 3. Papers
# -----------------------------------------------------------------------
echo "3. Updating papers folder..."

# Remove stale working documents
for f in rcp-v2-paper-outline.md v2-discussion-notes.md rcp-v2-rep-justification.md rcp-v2-theoretical-framework.md SessionNotes4-26-26.rtf; do
  if [ -f "$EXP_S/papers/$f" ]; then
    rm "$EXP_S/papers/$f"
    echo "   Removed stale: $f"
  fi
done

# Copy current paper, preregistration, and figures
for f in rcp-v2-full-paper-draft.md rcp-v2-paper.pdf rcp-v2-preregistration.md rcp-v2-preregistration.pdf; do
  if [ -f "$EXP_P/papers/$f" ]; then
    cp "$EXP_P/papers/$f" "$EXP_S/papers/$f"
    echo "   Copied: $f"
  else
    echo "   WARNING: $f not found in Platform papers/"
  fi
done

# Copy figure files
for f in "$EXP_P/papers/"fig*.png; do
  if [ -f "$f" ]; then
    cp "$f" "$EXP_S/papers/"
    echo "   Copied: $(basename $f)"
  fi
done

# Keep the LessWrong post if it exists (it's a published piece)
if [ -f "$EXP_P/papers/lessrong-reasoning-compliance.md" ]; then
  cp "$EXP_P/papers/lessrong-reasoning-compliance.md" "$EXP_S/papers/"
  echo "   Copied: lessrong-reasoning-compliance.md"
fi

echo "   Papers folder updated."

# -----------------------------------------------------------------------
# 4. Raw results for 8 paper models
# -----------------------------------------------------------------------
echo "4. Copying raw results for 8 paper models..."

MODELS=(
  "anthropic_claude-opus-4-6"
  "anthropic_claude-sonnet-4-6"
  "google_gemini-2.5-flash"
  "openai_gpt-5.4"
  "openai_gpt-5.4-mini"
  "together_meta-llama_Llama-3.3-70B-Instruct-Turbo"
  "xai_grok-4-1-fast-non-reasoning"
  "xai_grok-4.20"
)

mkdir -p "$STANDALONE/results/rcp-v2"

for model in "${MODELS[@]}"; do
  src="$PLATFORM/results/rcp-v2/$model"
  dst="$STANDALONE/results/rcp-v2/$model"
  if [ -d "$src" ]; then
    echo "   Copying $model..."
    rsync -a --delete "$src/" "$dst/"
    # Count runs and total responses
    runs=$(find "$dst" -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d ' ')
    echo "   $model: $runs runs copied."
  else
    echo "   WARNING: $src not found!"
  fi
done

echo "   Results copy complete."

# -----------------------------------------------------------------------
# 5. Report data (report.json, report-lite.json, explanations.json)
# -----------------------------------------------------------------------
echo "5. Copying report data files..."

# The root-level report files in the experiment dir
for f in report.json report-lite.json explanations.json; do
  if [ -f "$EXP_P/$f" ]; then
    cp "$EXP_P/$f" "$EXP_S/$f"
    size=$(ls -lh "$EXP_S/$f" | awk '{print $5}')
    echo "   $f: $size"
  fi
done

# Analysis subdirectory reports (per-temperature)
for subdir in rcp-v2-temp0 rcp-v2-temp07; do
  src="$EXP_P/analysis/$subdir"
  dst="$EXP_S/analysis/$subdir"
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    for f in report.json report-lite.json explanations.json; do
      if [ -f "$src/$f" ]; then
        cp "$src/$f" "$dst/$f"
      fi
    done
    echo "   analysis/$subdir/ synced."
  fi
done

# Also copy pre-computed analysis results
for f in pca_results.json permutation_results.json embedding_validation.json; do
  if [ -f "$EXP_P/analysis/$f" ]; then
    cp "$EXP_P/analysis/$f" "$EXP_S/analysis/$f"
    echo "   analysis/$f synced."
  fi
done

echo "   Report data complete."

# -----------------------------------------------------------------------
# 6. Shared infrastructure (runner, models, server, etc.)
# -----------------------------------------------------------------------
echo "6. Syncing shared infrastructure..."

# Runner
rsync -a --delete --exclude='__pycache__' "$PLATFORM/runner/" "$STANDALONE/runner/"
echo "   runner/ synced."

# Models registry
rsync -a --delete "$PLATFORM/models/" "$STANDALONE/models/"
echo "   models/ synced."

# Server and startup
for f in server.py start.sh requirements.txt .env.example; do
  if [ -f "$PLATFORM/$f" ]; then
    cp "$PLATFORM/$f" "$STANDALONE/$f"
    echo "   $f synced."
  fi
done

# Review types (for the review harness)
if [ -d "$PLATFORM/review-types" ]; then
  rsync -a --delete "$PLATFORM/review-types/" "$STANDALONE/review-types/"
  echo "   review-types/ synced."
fi

# UI
rsync -a --delete "$PLATFORM/ui/" "$STANDALONE/ui/"
echo "   ui/ synced."

# ARCHITECTURE.md
cp "$PLATFORM/ARCHITECTURE.md" "$STANDALONE/ARCHITECTURE.md"
echo "   ARCHITECTURE.md synced."

# -----------------------------------------------------------------------
# 7. Fix .gitignore (results must be tracked in standalone)
# -----------------------------------------------------------------------
echo "7. Updating .gitignore..."

cat > "$STANDALONE/.gitignore" << 'EOF'
.env
__pycache__/
*.pyc
.DS_Store
*.egg-info/
.venv/
.embedding-venv/
.pytest_cache/
EOF

echo "   .gitignore updated (results/ no longer excluded)."

# -----------------------------------------------------------------------
# 8. Remove stale files
# -----------------------------------------------------------------------
echo "8. Cleaning up stale files..."

# Remove SESSION-CONTEXT.md (working notes, not for public repo)
if [ -f "$EXP_S/SESSION-CONTEXT.md" ]; then
  rm "$EXP_S/SESSION-CONTEXT.md"
  echo "   Removed SESSION-CONTEXT.md"
fi

# Remove standalone.json if it's a stale config
if [ -f "$STANDALONE/standalone.json" ]; then
  rm "$STANDALONE/standalone.json"
  echo "   Removed standalone.json"
fi

# Remove deploy scripts (not relevant for public repo)
for f in deploy-reports.sh run_analysis.sh; do
  if [ -f "$EXP_S/$f" ]; then
    rm "$EXP_S/$f"
    echo "   Removed $f"
  fi
done

# Remove old report-sections.js from experiment root (was duplicated)
if [ -f "$EXP_S/report-sections.js" ]; then
  rm "$EXP_S/report-sections.js"
  echo "   Removed stale root-level report-sections.js"
fi

# Remove factor-run.txt and permutation-run.txt (run logs, not source)
for f in factor-run.txt permutation-run.txt; do
  if [ -f "$EXP_S/$f" ]; then
    rm "$EXP_S/$f"
    echo "   Removed $f"
  fi
  if [ -f "$EXP_S/analysis/$f" ]; then
    rm "$EXP_S/analysis/$f"
    echo "   Removed analysis/$f"
  fi
done

echo ""
echo "=== Sync complete ==="
echo ""

# -----------------------------------------------------------------------
# Verification
# -----------------------------------------------------------------------
echo "=== Verification ==="

echo ""
echo "Report viewer files:"
for f in report.html; do
  diff "$EXP_P/$f" "$EXP_S/$f" > /dev/null 2>&1 && echo "  $f: OK" || echo "  $f: MISMATCH"
done
for f in report-app.js report-sections.js report-utils.js report.css; do
  diff "$EXP_P/reports/$f" "$EXP_S/reports/$f" > /dev/null 2>&1 && echo "  reports/$f: OK" || echo "  reports/$f: MISMATCH"
done

echo ""
echo "Pipeline files:"
for f in build_report.py config.json parse.py; do
  diff "$EXP_P/$f" "$EXP_S/$f" > /dev/null 2>&1 && echo "  $f: OK" || echo "  $f: MISMATCH"
done

echo ""
echo "Results data:"
for model in "${MODELS[@]}"; do
  dst="$STANDALONE/results/rcp-v2/$model"
  if [ -d "$dst" ]; then
    runs=$(find "$dst" -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d ' ')
    echo "  $model: $runs runs"
  else
    echo "  $model: MISSING"
  fi
done

echo ""
echo "Papers:"
ls -la "$EXP_S/papers/" 2>/dev/null

echo ""
echo "Total standalone size:"
du -sh "$STANDALONE" 2>/dev/null

echo ""
echo "=== Done. Review the verification output above, then run: ==="
echo "  cd $STANDALONE"
echo "  python3 -m http.server 8002"
echo "  # Open http://localhost:8002/experiments/rcp-v2/report.html"
echo "  # Verify temperature toggle and all sections render"
