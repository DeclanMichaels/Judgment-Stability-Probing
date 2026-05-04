/**
 * report-app.js - Report orchestration and initialization.
 * Depends on: report-utils.js, report-sections.js
 */

/* -----------------------------------------------------------------------
 * Main report renderer (dispatches to section renderers)
 * ----------------------------------------------------------------------- */

function renderReport(report, activeTemp) {
  // Determine which sections and models to show
  var tempKey = String(activeTemp != null ? activeTemp : (report.analysis_temperature || 0));
  var byTemp = report.sections_by_temperature || {};
  var sections, models;

  if (byTemp[tempKey]) {
    sections = byTemp[tempKey].sections;
    models = byTemp[tempKey].models;
  } else {
    sections = report.sections;
    models = report.models;
  }

  // Append cross-temperature sections (e.g. temp_comparison) that only exist
  // in the top-level sections array, not in per-temperature sections.
  var crossTempTypes = {temp_comparison: true};
  if (report.sections) {
    for (var ci = 0; ci < report.sections.length; ci++) {
      var cs = report.sections[ci];
      if (crossTempTypes[cs.type]) {
        // Only append if not already present
        var found = false;
        for (var si = 0; si < sections.length; si++) {
          if (sections[si].type === cs.type) { found = true; break; }
        }
        if (!found) sections = sections.concat([cs]);
      }
    }
  }

  var availTemps = Object.keys(byTemp).sort(function(a, b) { return parseFloat(a) - parseFloat(b); });
  var html = '';

  // Header
  html += '<header>';
  html += '<h1>' + esc(report.title) + '</h1>';
  html += '<div class="meta">';
  html += '<span>' + models.length + ' models</span>';
  html += '<span>' + report.concept_count + ' concepts, ' + report.pair_count + ' pairs</span>';
  html += '<span>' + report.framings.length + ' framings</span>';
  html += '<span>Generated: ' + new Date(report.generated).toLocaleString() + '</span>';
  html += '</div>';

  // Temperature toggle
  if (availTemps.length > 1) {
    html += '<div class="temp-toggle">';
    html += '<span class="temp-label">Temperature:</span>';
    for (var ti = 0; ti < availTemps.length; ti++) {
      var t = availTemps[ti];
      var active = t === tempKey ? ' active' : '';
      var modelCount = byTemp[t] ? byTemp[t].models.length : models.length;
      html += '<button class="temp-btn' + active + '" data-temp="' + t + '">' + t + ' (' + modelCount + ' models)</button>';
    }
    html += '</div>';
  } else {
    html += '<div class="temp-toggle"><span class="temp-label">Temperature: ' + tempKey + '</span></div>';
  }

  html += '<div class="hypothesis">' + esc(report.hypothesis) + '</div>';

  // Model metadata table (Step 7)
  if (report.models_meta) {
    html += '<details class="model-meta-details">';
    html += '<summary>Model Temperature Metadata</summary>';
    html += '<table class="model-meta-table"><tr>';
    html += '<th>Model</th><th>Vendor</th><th>Temp 0</th><th>Temp 0.7</th><th>Iterations (t=0 / t=0.7)</th><th>Ratings (t=0 / t=0.7)</th>';
    html += '</tr>';
    var metaModels = Object.keys(report.models_meta).sort();
    for (var mi = 0; mi < metaModels.length; mi++) {
      var mName = metaModels[mi];
      var mm = report.models_meta[mName];
      var t0 = mm.temperatures['0.0'];
      var t07 = mm.temperatures['0.7'];
      var vendor = (t0 || t07 || {}).vendor || 'unknown';
      var hasT0 = mm.has_temp_0;
      var hasT07 = mm.has_temp_07;
      var checkMark = '\u2713';
      var crossMark = '\u2014';
      var itersT0 = t0 ? String(t0.iterations) : crossMark;
      var itersT07 = t07 ? String(t07.iterations) : crossMark;
      var ratingsT0 = t0 ? t0.valid_ratings.toLocaleString() : crossMark;
      var ratingsT07 = t07 ? t07.valid_ratings.toLocaleString() : crossMark;
      html += '<tr>';
      html += '<td class="model">' + esc(mName) + '</td>';
      html += '<td>' + esc(vendor) + '</td>';
      html += '<td style="text-align:center;color:' + (hasT0 ? 'var(--success)' : 'var(--dim)') + '">' + (hasT0 ? checkMark : crossMark) + '</td>';
      html += '<td style="text-align:center;color:' + (hasT07 ? 'var(--success)' : 'var(--dim)') + '">' + (hasT07 ? checkMark : crossMark) + '</td>';
      html += '<td class="num">' + itersT0 + ' / ' + itersT07 + '</td>';
      html += '<td class="num">' + ratingsT0 + ' / ' + ratingsT07 + '</td>';
      html += '</tr>';
    }
    html += '</table></details>';
  }

  html += '</header>';

  // Section renderer map
  var renderers = {
    data_quality:        renderQuality,
    cluster_validation:  renderClusters,
    drift_analysis:      renderDrift,
    fsi_heatmap:         function(s) { return renderFSI(s, models); },
    permutation_tests:   renderPermutation,
    pca_analysis:        renderPCA,
    compliance_gradient: renderCompliance,
    procrustes_alignment:renderProcrustes,
    variance_comparison: renderVariance,
    explanation_viewer:  renderExplanations,
    temp_comparison:     renderTempComparison
  };

  // Nav
  html += '<nav>';
  for (var i = 0; i < sections.length; i++) {
    var fn = renderers[sections[i].type];
    if (!fn) continue;
    html += '<a href="#section-' + i + '">' + esc(sections[i].title) + '</a>';
  }
  html += '</nav>';

  // Sections
  html += '<main>';

  for (var si = 0; si < sections.length; si++) {
    var s = sections[si];
    var fn = renderers[s.type];
    if (!fn) continue;

    html += '<section id="section-' + si + '">';
    html += '<h2>' + esc(s.title) + '</h2>';
    html += '<div class="narrative">' + esc(s.narrative) + '</div>';
    html += fn(s);
    html += '</section>';
  }

  html += '</main>';
  return html;
}

/** Minimal HTML escaping for report text fields. */
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* -----------------------------------------------------------------------
 * Load and initialize
 * ----------------------------------------------------------------------- */

fetch('report-lite.json')
  .then(function(r) {
    if (!r.ok) return fetch('report.json');  // fallback if lite doesn't exist
    return r;
  })
  .then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(function(report) {
    window._report = report;
    window._activeTemp = report.analysis_temperature || 0;
    document.getElementById('loading').style.display = 'none';
    var app = document.getElementById('app');
    app.style.display = 'block';

    // Clean up previous listeners
    if (window._scrollHandler) {
      window.removeEventListener('scroll', window._scrollHandler);
    }

    function renderWithTemp(temp) {
      // Clean up PCA listeners from previous render
      if (window._pcaCleanup) { window._pcaCleanup(); window._pcaCleanup = null; }

      window._activeTemp = temp;
      app.innerHTML = renderReport(report, temp);

      // Initialize FSI
      if (window._fsiData) updateFSI();

      // Initialize PCA scatter
      if (window._pcaData && document.getElementById('pca-scatter')) updatePCAScatter();

      // Attach toggle handlers
      var btns = document.querySelectorAll('.temp-btn');
      btns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          renderWithTemp(parseFloat(this.getAttribute('data-temp')));
        });
      });

      // Scroll-based nav highlighting
      var navLinks = document.querySelectorAll('nav a');
      window._scrollHandler = function() {
        var scrollPos = window.scrollY + 100;
        navLinks.forEach(function(link) {
          var target = document.querySelector(link.getAttribute('href'));
          if (target && target.offsetTop <= scrollPos && target.offsetTop + target.offsetHeight > scrollPos) {
            navLinks.forEach(function(l) { l.classList.remove('active'); });
            link.classList.add('active');
          }
        });
      };
      window.addEventListener('scroll', window._scrollHandler);
    }

    renderWithTemp(window._activeTemp);
  })
  .catch(function(err) {
    document.getElementById('loading').textContent = 'Failed to load report: ' + err.message;
  });
