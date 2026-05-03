#!/bin/bash
# deploy-reports.sh - Deploy rebuilt report data and viewer to S3.
#
# Copies analysis output to -Website-/reports/, creates index.html
# for any new report directories, uploads to S3, and invalidates
# CloudFront.
#
# Usage:
#   cd experiments/rcp-v2
#   ./deploy-reports.sh              # deploy everything
#   ./deploy-reports.sh --viewer     # deploy viewer files only
#
# Prerequisites:
#   - AWS CLI configured
#   - Analysis pipeline has been run (run_analysis.sh)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLATFORM_ROOT="$SCRIPT_DIR/../.."
WEBSITE="$PLATFORM_ROOT/../-Website-"
S3_BUCKET="s3://moral-os.com"
CLOUDFRONT_ID="EUEFG5WJ42EK8"

VIEWER_ONLY=false
if [ "$1" = "--viewer" ]; then
    VIEWER_ONLY=true
fi

# Index.html template for report directories
make_index() {
    local name="$1"
    cat << EOF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RCP Report: ${name} | Moral OS</title>
<link rel="stylesheet" href="/reports/viewer/report.css">
</head>
<body>
<div class="loading" id="loading">Loading report data...</div>
<div id="app" style="display:none"></div>
<script src="/reports/viewer/report-utils.js"></script>
<script src="/reports/viewer/report-sections.js"></script>
<script src="/reports/viewer/report-app.js"></script>
</body>
</html>
EOF
}

echo "============================================================"
echo "Deploy Reports to S3"
echo "============================================================"

# Step 1: Deploy viewer files
echo ""
echo "--- Deploying viewer ---"
aws s3 cp "$WEBSITE/reports/viewer/report-app.js" "$S3_BUCKET/reports/viewer/report-app.js" --content-type "application/javascript"
aws s3 cp "$WEBSITE/reports/viewer/report-sections.js" "$S3_BUCKET/reports/viewer/report-sections.js" --content-type "application/javascript"
aws s3 cp "$WEBSITE/reports/viewer/report-utils.js" "$S3_BUCKET/reports/viewer/report-utils.js" --content-type "application/javascript"
aws s3 cp "$WEBSITE/reports/viewer/report.css" "$S3_BUCKET/reports/viewer/report.css" --content-type "text/css"

if [ "$VIEWER_ONLY" = true ]; then
    echo ""
    echo "--- Invalidating CloudFront ---"
    aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/reports/viewer/*"
    echo "Done (viewer only)."
    exit 0
fi

# Step 2: Deploy report data
# Each report directory: copy report-lite.json, explanations.json, and
# ensure index.html exists.

REPORTS=(
    "rcp-v1:rcp-v1-temp0:$PLATFORM_ROOT/experiments/rcp-v1/analysis/rcp-v1-temp0"
    "rcp-v1:rcp-v1-temp07:$PLATFORM_ROOT/experiments/rcp-v1/analysis/rcp-v1-temp07"
    "rcp-v2:rcp-v2-temp0:$PLATFORM_ROOT/experiments/rcp-v2/analysis/rcp-v2-temp0"
    "rcp-v2:rcp-v2-temp07:$PLATFORM_ROOT/experiments/rcp-v2/analysis/rcp-v2-temp07"
)

for entry in "${REPORTS[@]}"; do
    IFS=':' read -r experiment name source_dir <<< "$entry"

    if [ ! -d "$source_dir" ]; then
        echo "  SKIP $name (no analysis output at $source_dir)"
        continue
    fi

    echo ""
    echo "--- Deploying $name ---"

    # Ensure -Website- has a copy
    dest="$WEBSITE/reports/$name"
    mkdir -p "$dest"

    # Copy report data
    if [ -f "$source_dir/report-lite.json" ]; then
        cp "$source_dir/report-lite.json" "$dest/report-lite.json"
        aws s3 cp "$dest/report-lite.json" "$S3_BUCKET/reports/$name/report-lite.json" --content-type "application/json"
        echo "  report-lite.json uploaded"
    fi

    if [ -f "$source_dir/explanations.json" ]; then
        cp "$source_dir/explanations.json" "$dest/explanations.json"
        aws s3 cp "$dest/explanations.json" "$S3_BUCKET/reports/$name/explanations.json" --content-type "application/json"
        echo "  explanations.json uploaded"
    fi

    # Create index.html if missing
    if [ ! -f "$dest/index.html" ]; then
        make_index "$name" > "$dest/index.html"
        echo "  index.html created"
    fi
    aws s3 cp "$dest/index.html" "$S3_BUCKET/reports/$name/index.html" --content-type "text/html"
done

# Step 3: Invalidate CloudFront
echo ""
echo "--- Invalidating CloudFront ---"
aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/reports/*"

echo ""
echo "============================================================"
echo "Deploy complete."
echo "============================================================"
