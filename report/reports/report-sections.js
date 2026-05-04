/**
 * report-sections.js - Section renderers.
 * Depends on: report-utils.js
 */

var DOMAIN_COLORS = {
  physical: '#5090d0',
  institutional: '#d0a040',
  moral: '#e05070'
};

/* -----------------------------------------------------------------------
 * Section: Data Quality
 * ----------------------------------------------------------------------- */

function renderQuality(s) {
  // Find models with missing data for annotation examples
  var cleanModels = [], gapModels = [];
  for (var i = 0; i < s.rows.length; i++) {
    var r = s.rows[i];
    var missing = r.missing != null ? r.missing : Math.max(0, (r.expected || 0) - r.valid_ratings);
    if (missing === 0) cleanModels.push(r.model);
    else gapModels.push({model: r.model, missing: missing});
  }

  var pairCount = (window._report && window._report.pair_count) || '?';
  var framingCount = (window._report && window._report.framings) ? window._report.framings.length : '?';
  var totalCalls = (pairCount !== '?' && framingCount !== '?') ? (pairCount * framingCount).toLocaleString() : '?';

  var ab = 'Each model was asked to rate all ' + pairCount.toLocaleString() + ' concept pairs under all ' + framingCount + ' framings (' + totalCalls + ' total calls). ';
  ab += '<strong>Ratings</strong> counts how many calls returned a valid 1-7 number. ';
  ab += '<strong>Parse %</strong> is ratings divided by expected calls. ';
  ab += '<strong>Missing</strong> is the number of expected responses that produced no valid rating. ';
  ab += '<strong>Refusals</strong> are cases where the model declined to rate.';
  var ex = '';
  if (cleanModels.length === s.rows.length) {
    ex += 'All ' + s.rows.length + ' models produced complete data with zero missing responses.';
  } else if (cleanModels.length > 0) {
    ex += '<strong>' + cleanModels.join(', ') + '</strong> produced complete data. ';
    for (var gi = 0; gi < gapModels.length; gi++) {
      ex += '<strong>' + gapModels[gi].model + '</strong> is missing ' + gapModels[gi].missing + ' response' + (gapModels[gi].missing > 1 ? 's' : '') + '. ';
    }
  }
  ab += annoExample(ex);

  var h = annotation(ab);

  h += '<table><tr><th>Model</th><th class="num">Ratings</th><th class="num">Missing</th><th class="num">Parse %</th><th class="num">Refusals</th></tr>';
  for (var i = 0; i < s.rows.length; i++) {
    var r = s.rows[i];
    // Support both old format (api_errors) and new format (missing)
    var missing = r.missing != null ? r.missing : Math.max(0, (r.expected || 0) - r.valid_ratings);
    h += '<tr><td class="model">' + r.model + '</td>';
    h += '<td class="num">' + r.valid_ratings.toLocaleString() + '</td>';
    h += '<td class="num">' + (missing > 0 ? '<span style="color:var(--warning)">' + missing + '</span>' : '0') + '</td>';
    h += '<td class="num">' + r.parse_rate.toFixed(1) + '%</td>';
    h += '<td class="num">' + r.refusals + '</td></tr>';
  }
  return h + '</table>';
}

/* -----------------------------------------------------------------------
 * Section: Cluster Validation
 * ----------------------------------------------------------------------- */

function renderClusters(s) {
  var perfect = [], worst = {model: '', accuracy: 1.0, misplaced: []};
  for (var i = 0; i < s.models.length; i++) {
    var d = s.data[s.models[i]];
    if (d.accuracy === 1.0) perfect.push(s.models[i]);
    if (d.accuracy < worst.accuracy) worst = {model: s.models[i], accuracy: d.accuracy, misplaced: d.misplaced};
  }

  var ab = 'This validates that our 54 concepts actually form three distinct groups. We take each model\'s unframed similarity ratings, ';
  ab += 'build a distance matrix (more similar = closer), and use Ward clustering to find 3 groups. ';
  ab += 'If the instrument works, the 3 groups should match our 3 domains: physical, institutional, moral. ';
  ab += '<strong>Accuracy</strong> is the percentage of concepts that land in their correct domain.';
  var ex = '';
  if (perfect.length > 0) {
    ex += '<strong>' + perfect.join(', ') + '</strong> achieved perfect 54/54. ';
    ex += 'Every concept was grouped with its own domain based purely on the model\'s similarity ratings. ';
  }
  if (worst.misplaced.length > 0) {
    ex += '<strong>' + worst.model + '</strong> misplaced ' + worst.misplaced.length + ' concepts. ';
    var m = worst.misplaced[0];
    ex += 'For example, <strong>' + m.concept + '</strong> (a ' + m.true_domain + ' concept) was grouped with ' + m.clustered_with + ' concepts, ';
    ex += 'meaning the model sees it as more similar to ' + m.clustered_with + ' concepts than to other ' + m.true_domain + ' ones.';
  }
  if (ex) ab += annoExample(ex);

  var h = annotation(ab);

  h += '<table><tr><th>Model</th><th class="num">Accuracy</th><th>Misplaced Concepts</th></tr>';
  for (var i = 0; i < s.models.length; i++) {
    var model = s.models[i];
    var d = s.data[model];
    h += '<tr><td class="model">' + model + '</td>';
    h += '<td class="num">' + d.accuracy_fraction + ' (' + (d.accuracy * 100).toFixed(1) + '%)</td>';
    h += '<td>';
    for (var j = 0; j < d.misplaced.length; j++) {
      var mp = d.misplaced[j];
      h += '<span class="tag tag-' + mp.true_domain + '">' + mp.concept + ' \u2192 ' + mp.clustered_with + '</span>';
    }
    if (d.misplaced.length === 0) h += '<span style="color:var(--success)">Perfect</span>';
    h += '</td></tr>';
  }
  return h + '</table>';
}

/* -----------------------------------------------------------------------
 * Section: Drift Analysis
 * ----------------------------------------------------------------------- */

function renderDrift(s) {
  var framings = s.framings;

  // Find extremes under first nonsense framing for annotation
  var nonsenseFramings = getNonsenseFramings();
  var annoFrame = nonsenseFramings[0] || 'geometric';
  var hiModel = '', hiDrift = 0, loModel = '', loDrift = 999;
  for (var i = 0; i < s.models.length; i++) {
    var nf = (s.data[s.models[i]] || {})[annoFrame] || {};
    if (nf.abs_drift != null) {
      if (nf.abs_drift > hiDrift) { hiDrift = nf.abs_drift; hiModel = s.models[i]; }
      if (nf.abs_drift < loDrift) { loDrift = nf.abs_drift; loModel = s.models[i]; }
    }
  }
  var hiRho = ((s.data[hiModel] || {})[annoFrame] || {}).spearman_rho;
  var loRho = ((s.data[loModel] || {})[annoFrame] || {}).spearman_rho;

  var ab = '<strong>Absolute drift</strong> is the average change in rating (on the 1-7 scale) across all 1,431 pairs when a framing is applied. ';
  ab += 'A drift of 0.5 means the model shifted its ratings by half a point on average. A drift of 1.5 means many individual pairs moved 2-3 points. ';
  ab += 'Higher numbers = more sensitivity to framing.';
  ab += annoExample('Under ' + annoFrame + ' framing, <strong>' + hiModel + '</strong> drifted ' + hiDrift.toFixed(3) + ' points on average (most destabilized). ' +
    '<strong>' + loModel + '</strong> drifted only ' + loDrift.toFixed(3) + ' (most stable).');
  ab += '<strong>Domain drift</strong> (dot strips below) breaks this down by concept type. ';
  ab += '<span style="color:#5090d0">&bull;</span> Physical concepts are the control (should not move under cultural framing). ';
  ab += '<span style="color:#d0a040">&bull;</span> Institutional concepts are the hypothesized vulnerable middle. ';
  ab += '<span style="color:#e05070">&bull;</span> Moral concepts are the alignment target. ';
  ab += 'If the hypothesis holds, blue dots cluster left, gold dots spread right, and pink dots sit in between across all models and framings.';

  var h = annotation(ab, true);

  // Assign model colors
  var modelColors = {};
  for (var i = 0; i < s.models.length; i++) {
    modelColors[s.models[i]] = MODEL_PALETTE[i % MODEL_PALETTE.length];
  }

  // Domain dot strip: collect domain drift per model per framing
  var domains = ['physical', 'institutional', 'moral'];
  var domColors = DOMAIN_COLORS;

  // Find global max domain drift for consistent x-axis
  var globalMax = 0.3;
  for (var i = 0; i < s.models.length; i++) {
    var md = s.data[s.models[i]] || {};
    for (var j = 0; j < framings.length; j++) {
      var dd = (md[framings[j]] || {}).domain_drift || {};
      for (var di = 0; di < domains.length; di++) {
        var v = (dd[domains[di]] || {}).abs_drift;
        if (v != null && v > globalMax) globalMax = v;
      }
    }
  }
  globalMax = Math.ceil(globalMax * 5) / 5 + 0.1;

  // SVG dimensions per panel
  var ROW_H = 30;
  var PAD = {top: 5, right: 20, bottom: 30, left: 8};
  var PLOT_W = 280;
  var panelW = PAD.left + PLOT_W + PAD.right;
  var labelW = 175;

  // Split framings into cultural and nonsense groups
  var culturalFramings = [];
  var nonsenseList = [];
  for (var fi = 0; fi < framings.length; fi++) {
    if (nonsenseFramings.indexOf(framings[fi]) !== -1) {
      nonsenseList.push(framings[fi]);
    } else {
      culturalFramings.push(framings[fi]);
    }
  }
  var framingGroups = [
    {label: 'Cultural Framings', framings: culturalFramings},
    {label: 'Nonsense Framings', framings: nonsenseList}
  ];

  for (var gi = 0; gi < framingGroups.length; gi++) {
    var group = framingGroups[gi];
    if (group.framings.length === 0) continue;

    h += '<div style="font-size:0.78rem;color:var(--dim);font-weight:600;margin:' + (gi > 0 ? '1.5rem' : '0') + ' 0 0.3rem;text-transform:uppercase;letter-spacing:0.05em">' + group.label + '</div>';
    h += '<div class="drift-strip-container" style="display:flex;overflow-x:auto;gap:0rem;margin:0 0 0.5rem;padding-bottom:0.5rem">';

    // Model name labels (first column per group)
    var firstPanelH = PAD.top + s.models.length * ROW_H + PAD.bottom;
    h += '<div style="flex:0 0 auto">';
    h += '<div style="font-weight:600;font-size:0.82rem;margin-bottom:0.3rem;color:transparent">&nbsp;</div>';
    h += '<svg viewBox="0 0 ' + labelW + ' ' + firstPanelH + '" style="width:' + labelW + 'px;display:block" xmlns="http://www.w3.org/2000/svg">';
    for (var mi = 0; mi < s.models.length; mi++) {
      var rowY = PAD.top + mi * ROW_H + ROW_H / 2;
      h += '<g style="cursor:pointer" onclick="highlightDriftRow(' + mi + ')">';
      if (mi % 2 === 0) {
        h += '<rect x="0" y="' + (PAD.top + mi * ROW_H) + '" width="' + labelW + '" height="' + ROW_H + '" fill="#1a1a28" opacity="0.5"/>';
      } else {
        h += '<rect x="0" y="' + (PAD.top + mi * ROW_H) + '" width="' + labelW + '" height="' + ROW_H + '" fill="transparent"/>';
      }
      h += '<rect class="drift-row-highlight" data-row="' + mi + '" x="0" y="' + (PAD.top + mi * ROW_H) + '" width="' + labelW + '" height="' + ROW_H + '" fill="#ffffff" opacity="0" style="pointer-events:none"/>';
      h += '<text x="' + (labelW - 6) + '" y="' + (rowY + 4) + '" text-anchor="end" fill="' + modelColors[s.models[mi]] + '" font-size="11" font-weight="600" style="pointer-events:none">' + s.models[mi] + '</text>';
      h += '</g>';
    }
    h += '</svg></div>';

    for (var fi = 0; fi < group.framings.length; fi++) {
      var framing = group.framings[fi];
    var panelH = PAD.top + s.models.length * ROW_H + PAD.bottom;

    h += '<div style="flex:0 0 auto;margin-left:' + (fi === 0 ? '0' : '0.5rem') + '">';
    h += '<div style="font-weight:600;font-size:0.82rem;margin-bottom:0.3rem;color:var(--text)">' + framing.charAt(0).toUpperCase() + framing.slice(1) + '</div>';
    h += '<svg id="drift-strip-' + gi + '-' + fi + '" viewBox="0 0 ' + panelW + ' ' + panelH + '" style="width:' + panelW + 'px;max-width:100%;display:block" xmlns="http://www.w3.org/2000/svg">';

    // X-axis grid and labels
    var nTicks = 5;
    for (var ti = 0; ti <= nTicks; ti++) {
      var xVal = (ti / nTicks) * globalMax;
      var xPos = PAD.left + (ti / nTicks) * PLOT_W;
      h += '<line x1="' + xPos + '" y1="' + PAD.top + '" x2="' + xPos + '" y2="' + (panelH - PAD.bottom) + '" stroke="#2a2a40" stroke-width="0.5"/>';
      h += '<text x="' + xPos + '" y="' + (panelH - 10) + '" text-anchor="middle" fill="#7a7a90" font-size="9">' + xVal.toFixed(1) + '</text>';
    }

    // Model rows
    for (var mi = 0; mi < s.models.length; mi++) {
      var model = s.models[mi];
      var md = s.data[model] || {};
      var dd = (md[framing] || {}).domain_drift || {};
      var rowY = PAD.top + mi * ROW_H + ROW_H / 2;

      // Row group
      h += '<g style="cursor:pointer" onclick="highlightDriftRow(' + mi + ')">';
      // Row background stripe
      if (mi % 2 === 0) {
        h += '<rect x="0" y="' + (PAD.top + mi * ROW_H) + '" width="' + panelW + '" height="' + ROW_H + '" fill="#1a1a28" opacity="0.5"/>';
      } else {
        h += '<rect x="0" y="' + (PAD.top + mi * ROW_H) + '" width="' + panelW + '" height="' + ROW_H + '" fill="transparent"/>';
      }
      // Highlight rect (hidden by default)
      h += '<rect class="drift-row-highlight" data-row="' + mi + '" x="0" y="' + (PAD.top + mi * ROW_H) + '" width="' + panelW + '" height="' + ROW_H + '" fill="#ffffff" opacity="0" style="pointer-events:none"/>';

      // Domain dots (staggered vertically to prevent overlap)
      var domOffsets = {physical: -7, institutional: 0, moral: 7};
      for (var di = 0; di < domains.length; di++) {
        var dom = domains[di];
        var v = (dd[dom] || {}).abs_drift;
        if (v == null) continue;
        var cx = PAD.left + (v / globalMax) * PLOT_W;
        var cy = rowY + domOffsets[dom];
        var r = 4.5;
        var opacity = 0.85;
        h += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy + '" r="' + r + '" fill="' + domColors[dom] + '" fill-opacity="' + opacity + '" data-model="' + model + '">';
        h += '<title>' + model + ' / ' + framing + '\n' + dom + ': ' + v.toFixed(3) + '</title></circle>';
      }
      h += '</g>';
    }

    h += '</svg>';
    h += '</div>';
    }
    h += '</div>'; // close group flex container
  }

  // Model toggles (same pattern as Procrustes)
  h += '<div class="drift-legend" style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.75rem">';
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i];
    h += '<button class="drift-toggle active" data-model="' + m + '" onclick="toggleDriftModel(this)" style="background:none;border:1px solid ' + modelColors[m] + ';color:var(--text);padding:0.2rem 0.6rem;border-radius:4px;font-size:0.72rem;cursor:pointer;display:flex;align-items:center;gap:0.3rem;font-family:inherit">';
    h += '<span style="width:8px;height:8px;border-radius:2px;display:inline-block;background:' + modelColors[m] + '"></span>' + m + '</button>';
  }
  h += '</div>';

  // Domain legend
  h += '<div style="display:flex;gap:1.5rem;font-size:0.78rem;margin-bottom:1.5rem">';
  var domLabels = {physical: 'Physical', institutional: 'Institutional', moral: 'Moral'};
  for (var di = 0; di < domains.length; di++) {
    h += '<span style="display:flex;align-items:center;gap:0.3rem">';
    h += '<span style="width:10px;height:10px;border-radius:50%;background:' + domColors[domains[di]] + '"></span>';
    h += domLabels[domains[di]] + '</span>';
  }
  h += '</div>';

  // Collapsible raw tables
  h += '<details><summary style="font-size:0.8rem;color:var(--dim);cursor:pointer">Show raw drift tables</summary>';

  // Absolute drift heatmap
  var absVals = collectValues(s.data, s.models, framings, 'abs_drift');
  var absMax = absVals.length ? Math.max.apply(null, absVals) : 1;

  h += '<h3>Absolute Drift from Unframed Baseline</h3>';
  h += '<table><tr><th>Model</th>';
  for (var j = 0; j < framings.length; j++) h += '<th class="num">' + framings[j].substring(0, 8) + '</th>';
  h += '</tr>';
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i], md = s.data[m] || {};
    h += '<tr><td class="model">' + m + '</td>';
    for (var j = 0; j < framings.length; j++) {
      var v = (md[framings[j]] || {}).abs_drift;
      h += '<td class="heat" style="background:' + heatColor(v, 0, absMax) + '">' + (v != null ? v.toFixed(3) : '--') + '</td>';
    }
    h += '</tr>';
  }
  h += '</table>';

  // Spearman rho
  h += '<h3>Spearman Rank Correlation (1.0 = perfect preservation)</h3>';
  h += '<table><tr><th>Model</th>';
  for (var j = 0; j < framings.length; j++) h += '<th class="num">' + framings[j].substring(0, 8) + '</th>';
  h += '</tr>';
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i], md = s.data[m] || {};
    h += '<tr><td class="model">' + m + '</td>';
    for (var j = 0; j < framings.length; j++) {
      var v = (md[framings[j]] || {}).spearman_rho;
      h += '<td class="heat" style="background:' + heatColor(v != null ? 1 - v : null, 0, 0.5) + '">' + (v != null ? v.toFixed(3) : '--') + '</td>';
    }
    h += '</tr>';
  }
  h += '</table>';

  // Domain drift under nonsense
  h += '<h3>Domain Drift Under Nonsense Framings</h3>';
  h += '<table><tr><th>Model</th>';
  var domAbbrev = {physical: 'Phys', institutional: 'Inst', moral: 'Moral'};
  for (var ni = 0; ni < nonsenseFramings.length; ni++) {
    var nfAbbrev = nonsenseFramings[ni].substring(0, 3);
    for (var di = 0; di < domains.length; di++) {
      h += '<th class="num">' + domAbbrev[domains[di]] + ' (' + nfAbbrev + ')</th>';
    }
  }
  h += '</tr>';
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i], md = s.data[m] || {};
    h += '<tr><td class="model">' + m + '</td>';
    for (var ni = 0; ni < nonsenseFramings.length; ni++) {
      var nfd = (md[nonsenseFramings[ni]] || {}).domain_drift || {};
      for (var di = 0; di < domains.length; di++) {
        var v = (nfd[domains[di]] || {}).abs_drift;
        h += '<td class="heat" style="background:' + heatColor(v, 0, 1.5) + '">' + (v != null ? v.toFixed(3) : '--') + '</td>';
      }
    }
    h += '</tr>';
  }
  h += '</table>';

  h += '</details>';

  return h;
}

/* -----------------------------------------------------------------------
 * Section: Temperature Comparison (cross-temperature)
 * ----------------------------------------------------------------------- */

function renderTempComparison(s) {
  var models = s.models_with_both;
  var framings = s.framings;
  var data = s.data;
  var nonsenseFramings = getNonsenseFramings();

  // Annotation
  var ab = 'This section compares each model\'s drift at <strong>temperature 0</strong> (deterministic, single pass) ';
  ab += 'and <strong>temperature 0.7</strong> (stochastic, averaged across iterations). ';
  ab += 'If both temperatures produce similar drift patterns, the effect is structural: it\'s baked into the model\'s learned representations, not an artifact of sampling randomness. ';
  ab += 'Each model shows two rows per framing: <strong>top row = temp 0</strong>, <strong>bottom row = temp 0.7</strong>. ';
  ab += 'If the domain dots align vertically between the two rows, the drift pattern is structural.';
  ab += annoExample(s.n_structural + ' of ' + models.length + ' models show structural agreement across all framings. ' +
    s.n_divergent + ' show divergence in at least one framing.');

  var h = annotation(ab);

  // Models with only one temperature
  if (s.models_single_temp && s.models_single_temp.length > 0) {
    h += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:0.6rem 1rem;margin-bottom:1.5rem;font-size:0.82rem">';
    h += '<strong>Single-temperature models</strong> (excluded from comparison): ';
    for (var i = 0; i < s.models_single_temp.length; i++) {
      var st = s.models_single_temp[i];
      if (i > 0) h += ', ';
      h += st.model + ' (temp ' + st.available.join(', ') + ' only)';
    }
    h += '</div>';
  }

  // Summary verdict
  h += '<div class="finding-box"><h3>Summary</h3><p>';
  if (s.n_structural === models.length && models.length > 0) {
    h += 'All ' + models.length + ' models with both temperatures show <strong>structural agreement</strong> across all framings. ';
    h += 'Framing drift is a deterministic property of these models, not sampling noise.';
  } else if (s.n_divergent > 0) {
    h += s.n_structural + ' of ' + models.length + ' models are fully structural. ';
    var divergentModels = [];
    var dataKeys = Object.keys(data);
    for (var di = 0; di < dataKeys.length; di++) {
      if (!data[dataKeys[di]].all_structural) divergentModels.push(dataKeys[di]);
    }
    h += '<strong>' + divergentModels.join(', ') + '</strong> show divergence in at least one framing, ';
    h += 'meaning some drift at temp 0.7 may reflect sampling noise.';
  } else {
    h += 'No models available with both temperature conditions.';
  }
  h += '</p></div>';

  if (models.length === 0) return h;

  // Assign model colors
  var modelColors = {};
  for (var i = 0; i < models.length; i++) {
    modelColors[models[i]] = MODEL_PALETTE[i % MODEL_PALETTE.length];
  }

  var domains = ['physical', 'institutional', 'moral'];
  var domColors = DOMAIN_COLORS;
  var domOffsets = {physical: -6, institutional: 0, moral: 6};
  var globalMax = 0.3;
  for (var i = 0; i < models.length; i++) {
    var md = data[models[i]];
    for (var ti = 0; ti < 2; ti++) {
      var tempKey = ti === 0 ? '0.0' : '0.7';
      var tempData = (md.by_temp || {})[tempKey] || {};
      for (var j = 0; j < framings.length; j++) {
        var fd = tempData[framings[j]] || {};
        var dad = fd.domain_abs_drift || {};
        for (var di = 0; di < domains.length; di++) {
          var v = dad[domains[di]];
          if (v != null && v > globalMax) globalMax = v;
        }
      }
    }
  }
  globalMax = Math.ceil(globalMax * 5) / 5 + 0.1;

  // SVG dimensions
  var ROW_H = 22;
  var MODEL_GAP = 6;
  var PAD = {top: 5, right: 20, bottom: 30, left: 8};
  var PLOT_W = 280;
  var panelW = PAD.left + PLOT_W + PAD.right;
  var labelW = 175;

  // Total height: each model = 2 rows + gap
  var totalRowH = models.length * (2 * ROW_H + MODEL_GAP) - MODEL_GAP;
  var panelH = PAD.top + totalRowH + PAD.bottom;

  var culturalFramings = [];
  var nonsenseFramingsList = [];
  for (var fi = 0; fi < framings.length; fi++) {
    if (nonsenseFramings.indexOf(framings[fi]) !== -1) {
      nonsenseFramingsList.push(framings[fi]);
    } else {
      culturalFramings.push(framings[fi]);
    }
  }
  var framingGroups = [
    {label: 'Cultural Framings', framings: culturalFramings},
    {label: 'Nonsense Framings', framings: nonsenseFramingsList}
  ];

  for (var gi = 0; gi < framingGroups.length; gi++) {
    var group = framingGroups[gi];
    if (group.framings.length === 0) continue;

    h += '<div style="font-size:0.78rem;color:var(--dim);font-weight:600;margin:' + (gi > 0 ? '1.5rem' : '0') + ' 0 0.3rem;text-transform:uppercase;letter-spacing:0.05em">' + group.label + '</div>';
    h += '<div style="display:flex;overflow-x:auto;gap:0;margin:0 0 0.5rem;padding-bottom:0.5rem">';

    // Label column
    h += '<div style="flex:0 0 auto">';
    h += '<div style="font-weight:600;font-size:0.82rem;margin-bottom:0.3rem;color:transparent">&nbsp;</div>';
    h += '<svg viewBox="0 0 ' + labelW + ' ' + panelH + '" style="width:' + labelW + 'px;display:block" xmlns="http://www.w3.org/2000/svg">';
    for (var mi = 0; mi < models.length; mi++) {
      var blockY = PAD.top + mi * (2 * ROW_H + MODEL_GAP);
      var centerY = blockY + ROW_H;
      h += '<g style="cursor:pointer" onclick="highlightTempRow(' + mi + ')">';
      h += '<rect x="0" y="' + blockY + '" width="' + labelW + '" height="' + (2 * ROW_H) + '" fill="transparent"/>';
      h += '<rect class="temp-row-highlight" data-row="' + mi + '" x="0" y="' + blockY + '" width="' + labelW + '" height="' + (2 * ROW_H) + '" fill="#ffffff" opacity="0" style="pointer-events:none"/>';
      h += '<text x="' + (labelW - 6) + '" y="' + (centerY + 4) + '" text-anchor="end" fill="' + modelColors[models[mi]] + '" font-size="11" font-weight="600" style="pointer-events:none">' + models[mi] + '</text>';
      h += '<text x="' + (labelW - 6) + '" y="' + (blockY + ROW_H / 2 + 3) + '" text-anchor="end" fill="var(--dim)" font-size="8" style="pointer-events:none">t=0</text>';
      h += '<text x="' + (labelW - 6) + '" y="' + (blockY + ROW_H + ROW_H / 2 + 3) + '" text-anchor="end" fill="var(--dim)" font-size="8" style="pointer-events:none">t=0.7</text>';
      h += '</g>';
    }
    h += '</svg></div>';

    // Panels for this group
    for (var fi = 0; fi < group.framings.length; fi++) {
      var framing = group.framings[fi];
    h += '<div style="flex:0 0 auto;margin-left:' + (fi === 0 ? '0' : '0.3rem') + '">';
    h += '<div style="font-weight:600;font-size:0.82rem;margin-bottom:0.3rem;color:var(--text);text-align:center">' + framing.charAt(0).toUpperCase() + framing.slice(1) + '</div>';
    h += '<svg viewBox="0 0 ' + panelW + ' ' + panelH + '" style="width:' + panelW + 'px;max-width:100%;display:block" xmlns="http://www.w3.org/2000/svg">';

    // X-axis grid
    var nTicks = 5;
    for (var ti = 0; ti <= nTicks; ti++) {
      var xVal = (ti / nTicks) * globalMax;
      var xPos = PAD.left + (ti / nTicks) * PLOT_W;
      h += '<line x1="' + xPos + '" y1="' + PAD.top + '" x2="' + xPos + '" y2="' + (panelH - PAD.bottom) + '" stroke="#2a2a40" stroke-width="0.5"/>';
      h += '<text x="' + xPos + '" y="' + (panelH - 10) + '" text-anchor="middle" fill="#7a7a90" font-size="9">' + xVal.toFixed(1) + '</text>';
    }

    for (var mi = 0; mi < models.length; mi++) {
      var model = models[mi];
      var md = data[model];
      var blockY = PAD.top + mi * (2 * ROW_H + MODEL_GAP);
      var agr = (md.agreement || {})[framing];
      var isStructural = agr ? agr.structural : false;

      // Background block with click target
      h += '<g style="cursor:pointer" onclick="highlightTempRow(' + mi + ')">';
      h += '<rect x="0" y="' + blockY + '" width="' + panelW + '" height="' + (2 * ROW_H) + '" fill="' + (mi % 2 === 0 ? '#1a1a28' : 'transparent') + '" opacity="0.5"/>';
      h += '<rect class="temp-row-highlight" data-row="' + mi + '" x="0" y="' + blockY + '" width="' + panelW + '" height="' + (2 * ROW_H) + '" fill="#ffffff" opacity="0" style="pointer-events:none"/>';

      // Structural/divergent indicator line between rows
      var divY = blockY + ROW_H;
      h += '<line x1="' + PAD.left + '" y1="' + divY + '" x2="' + (PAD.left + PLOT_W) + '" y2="' + divY + '" stroke="' + (isStructural ? 'var(--success)' : 'var(--warning)') + '" stroke-width="0.5" stroke-dasharray="3,3" opacity="0.5"/>';

      // Two temp rows
      for (var ti = 0; ti < 2; ti++) {
        var tempKey = ti === 0 ? '0.0' : '0.7';
        var rowY = blockY + ti * ROW_H + ROW_H / 2;
        var tempData = ((md.by_temp || {})[tempKey] || {})[framing] || {};
        var dad = tempData.domain_abs_drift || {};

        for (var di = 0; di < domains.length; di++) {
          var dom = domains[di];
          var v = dad[dom];
          if (v == null) continue;
          var cx = PAD.left + (v / globalMax) * PLOT_W;
          var cy = rowY + domOffsets[dom];
          var r = 4;
          var opacity = ti === 0 ? 0.9 : 0.6;
          h += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy + '" r="' + r + '" fill="' + domColors[dom] + '" fill-opacity="' + opacity + '" data-model="' + model + '">';
          h += '<title>' + model + ' t=' + tempKey + ' / ' + framing + '\n' + dom + ': ' + v.toFixed(3) + '</title></circle>';
        }
      }
      h += '</g>';
    }

    h += '</svg></div>';
    }
    h += '</div>'; // close group flex container
  }

  // Legend
  h += '<div style="display:flex;gap:1.5rem;font-size:0.78rem;margin:0.5rem 0 0.5rem">';
  var domLabels = {physical: 'Physical', institutional: 'Institutional', moral: 'Moral'};
  for (var di = 0; di < domains.length; di++) {
    h += '<span style="display:flex;align-items:center;gap:0.3rem">';
    h += '<span style="width:10px;height:10px;border-radius:50%;background:' + domColors[domains[di]] + '"></span>';
    h += domLabels[domains[di]] + '</span>';
  }
  h += '<span style="color:var(--dim)">Top row = t=0 (bright) &middot; Bottom row = t=0.7 (faded)</span>';
  h += '<span style="color:var(--dim)"><span style="color:var(--success)">- -</span> structural &middot; <span style="color:var(--warning)">- -</span> divergent</span>';
  h += '</div>';

  // Collapsible raw tables
  h += '<details><summary style="font-size:0.8rem;color:var(--dim);cursor:pointer">Show raw comparison tables</summary>';

  // Side-by-side drift table
  h += '<h3>Side-by-Side Absolute Drift</h3>';
  h += '<table><tr><th>Model</th>';
  for (var j = 0; j < framings.length; j++) {
    var fLabel = framings[j].substring(0, 8);
    h += '<th class="num" colspan="3">' + fLabel + '</th>';
  }
  h += '</tr>';
  h += '<tr><th></th>';
  for (var j = 0; j < framings.length; j++) {
    h += '<th class="num" style="font-size:0.7rem;color:var(--dim)">t=0</th>';
    h += '<th class="num" style="font-size:0.7rem;color:var(--dim)">t=0.7</th>';
    h += '<th class="num" style="font-size:0.7rem;color:var(--dim)">\u0394</th>';
  }
  h += '</tr>';
  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var md = data[m];
    h += '<tr><td class="model">' + m + '</td>';
    for (var j = 0; j < framings.length; j++) {
      var f = framings[j];
      var d0 = ((md.by_temp || {})["0.0"] || {})[f];
      var d07 = ((md.by_temp || {})["0.7"] || {})[f];
      var agr = (md.agreement || {})[f];
      var v0 = d0 ? d0.abs_drift : null;
      var v07 = d07 ? d07.abs_drift : null;
      var diff = agr ? agr.abs_drift_diff : null;
      var isStructural = agr ? agr.structural : false;
      var diffColor = isStructural ? 'var(--success)' : 'var(--warning)';
      h += '<td class="num">' + (v0 != null ? v0.toFixed(3) : '--') + '</td>';
      h += '<td class="num">' + (v07 != null ? v07.toFixed(3) : '--') + '</td>';
      h += '<td class="num" style="color:' + diffColor + ';font-weight:600">' + (diff != null ? diff.toFixed(3) : '--') + '</td>';
    }
    h += '</tr>';
  }
  h += '</table>';

  // Spearman rho comparison
  h += '<h3>Spearman Rho Comparison</h3>';
  h += '<table><tr><th>Model</th>';
  for (var j = 0; j < framings.length; j++) {
    h += '<th class="num" colspan="3">' + framings[j].substring(0, 8) + '</th>';
  }
  h += '</tr>';
  h += '<tr><th></th>';
  for (var j = 0; j < framings.length; j++) {
    h += '<th class="num" style="font-size:0.7rem;color:var(--dim)">t=0</th>';
    h += '<th class="num" style="font-size:0.7rem;color:var(--dim)">t=0.7</th>';
    h += '<th class="num" style="font-size:0.7rem;color:var(--dim)">\u0394</th>';
  }
  h += '</tr>';
  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var md = data[m];
    h += '<tr><td class="model">' + m + '</td>';
    for (var j = 0; j < framings.length; j++) {
      var f = framings[j];
      var d0 = ((md.by_temp || {})["0.0"] || {})[f];
      var d07 = ((md.by_temp || {})["0.7"] || {})[f];
      var agr = (md.agreement || {})[f];
      var r0 = d0 ? d0.spearman_rho : null;
      var r07 = d07 ? d07.spearman_rho : null;
      var diff = agr ? agr.rho_diff : null;
      var isStructural = agr ? agr.structural : false;
      var diffColor = isStructural ? 'var(--success)' : 'var(--warning)';
      h += '<td class="num">' + (r0 != null ? r0.toFixed(3) : '--') + '</td>';
      h += '<td class="num">' + (r07 != null ? r07.toFixed(3) : '--') + '</td>';
      h += '<td class="num" style="color:' + diffColor + ';font-weight:600">' + (diff != null ? diff.toFixed(4) : '--') + '</td>';
    }
    h += '</tr>';
  }
  h += '</table>';

  h += '</details>';

  return h;
}

/* -----------------------------------------------------------------------
 * Section: FSI Heatmap
 * ----------------------------------------------------------------------- */

function renderFSI(s, models) {
  window._fsiData = s;
  window._fsiDomains = s.domains;

  var ab = 'Each concept appears in 53 pairs (one with every other concept). The <strong>Framing Sensitivity Index</strong> ';
  ab += 'is the mean absolute drift across all pairs containing that concept, under a given framing. ';
  ab += 'Concepts are sorted within each domain from most sensitive (top, longest bars) to least sensitive (bottom). ';
  ab += 'Each colored bar represents one framing. ';
  ab += 'The <strong>mean</strong> on the right is the average across all framings. ';
  ab += 'Physical concepts should show small bars (they\'re the control). ';
  ab += 'Large bars on moral or institutional concepts indicate framing vulnerability.';
  ab += annoExample('Select different models from the dropdown to compare. ' +
    'Look for: which concepts are most susceptible in each domain, and whether the pattern is consistent across models or model-specific.');

  var h = annotation(ab);

  h += '<div class="fsi-selector"><label>Model: </label>';
  h += '<select id="fsi-model" onchange="updateFSI()">';
  for (var i = 0; i < models.length; i++) {
    h += '<option value="' + models[i] + '">' + models[i] + '</option>';
  }
  h += '</select></div>';
  h += '<div id="fsi-table"></div>';

  return h;
}

/* -----------------------------------------------------------------------
 * Section: Compliance Gradient
 * ----------------------------------------------------------------------- */

function renderCompliance(s) {
  // If compliance data isn't available (e.g., no explanations under framed conditions)
  if (s.not_applicable) {
    return '<div class="finding-box" style="border-color:var(--dim)"><p style="color:var(--dim)">' +
      esc(s.narrative) + '</p></div>';
  }

  var nonsenseFramings = getNonsenseFramings();
  if (nonsenseFramings.length === 0) nonsenseFramings = Object.keys((s.summary[s.models[0]] || {}));

  // Find extremes under first nonsense framing for annotation
  var firstNF = nonsenseFramings[0] || 'geometric';
  var maxFirst = {model: '', rate: 0}, minFirst = {model: '', rate: 100};
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i];
    var fr = ((s.summary[m] || {})[firstNF] || {}).rate || 0;
    if (fr > maxFirst.rate) maxFirst = {model: m, rate: fr};
    if (fr < minFirst.rate) minFirst = {model: m, rate: fr};
  }

  var ab = '<strong>Compliance</strong> measures whether the model integrates framing language into its explanations, not just its ratings. ';
  for (var ni = 0; ni < nonsenseFramings.length; ni++) {
    var nf = nonsenseFramings[ni];
    ab += '<strong>' + nf.charAt(0).toUpperCase() + nf.slice(1) + ' compliance</strong> is detected by ';
    ab += ni === 0 ? 'semantically related keywords appearing in explanations. ' : 'the model echoing the framing term itself. ';
  }
  if (nonsenseFramings.length >= 2) {
    ab += 'The <strong>gradient</strong> between framings reveals how the model processes nonsense: ';
    ab += 'high ' + nonsenseFramings[0] + ' + low ' + nonsenseFramings[1] + ' means the model anchors on semantic content. High both means unconditional compliance.';
  }
  var secondRate = nonsenseFramings.length >= 2 ? ((s.summary[maxFirst.model] || {})[nonsenseFramings[1]] || {}).rate || 0 : 0;
  ab += annoExample('<strong>' + maxFirst.model + '</strong> integrated ' + firstNF + ' language into ' + maxFirst.rate.toFixed(1) + '% of explanations' +
    (nonsenseFramings.length >= 2 ? ' and echoed ' + nonsenseFramings[1] + ' in ' + secondRate.toFixed(1) + '%' : '') + '. ' +
    '<strong>' + minFirst.model + '</strong> showed only ' + minFirst.rate.toFixed(1) + '% ' + firstNF + ' compliance, the lowest in the set.');

  var h = annotation(ab);

  // Table headers from nonsense framings
  h += '<table><tr><th>Model</th>';
  for (var ni = 0; ni < nonsenseFramings.length; ni++) {
    h += '<th class="num">' + nonsenseFramings[ni].charAt(0).toUpperCase() + nonsenseFramings[ni].slice(1) + '</th>';
  }
  if (nonsenseFramings.length >= 2) h += '<th>Gradient</th>';
  h += '</tr>';

  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i];
    var sm = s.summary[m] || {};
    h += '<tr><td class="model">' + m + '</td>';
    var rates = [];
    for (var ni = 0; ni < nonsenseFramings.length; ni++) {
      var fd = sm[nonsenseFramings[ni]] || {};
      var rate = fd.rate || 0;
      rates.push(rate);
      h += '<td class="num bar-cell"><div class="bar-bg" style="width:' + rate + '%;background:' + barColor(rate) + '"></div>';
      h += '<span class="bar-label">' + rate.toFixed(1) + '% (' + (fd.compliant || 0) + '/' + (fd.total || 0) + ')</span></td>';
    }
    if (nonsenseFramings.length >= 2) {
      var ratio = rates[0] > 0 && rates[1] > 0 ? (rates[0] / rates[1]).toFixed(1) + ':1' : (rates[1] === 0 && rates[0] > 0) ? '\u221e' : 'none';
      h += '<td class="num">' + ratio + '</td>';
    }
    h += '</tr>';
  }
  h += '</table>';

  // Data-driven finding box
  var highest = {model: '', rates: []};
  var hiTotal = 0;
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i], sm = s.summary[m] || {};
    var total = 0;
    for (var ni = 0; ni < nonsenseFramings.length; ni++) {
      total += (sm[nonsenseFramings[ni]] || {}).rate || 0;
    }
    if (total > hiTotal) {
      hiTotal = total;
      highest.model = m;
      highest.rates = nonsenseFramings.map(function(nf) { return (sm[nf] || {}).rate || 0; });
    }
  }

  h += '<div class="finding-box"><h3>Key Finding</h3><p>';
  h += '<strong>' + highest.model + '</strong> shows ';
  var parts = [];
  for (var ni = 0; ni < nonsenseFramings.length; ni++) {
    parts.push(highest.rates[ni].toFixed(1) + '% ' + nonsenseFramings[ni]);
  }
  h += parts.join(' and ') + ' compliance, the highest in the set.';
  h += '</p></div>';

  return h;
}

/* -----------------------------------------------------------------------
 * Section: Procrustes Alignment (Scatter Plot)
 * ----------------------------------------------------------------------- */

function renderProcrustes(s) {
  var framings = s.framings;
  var nonsenseFramings = getNonsenseFramings();

  // Annotation
  var ab = 'Imagine each model\'s similarity ratings as a shape in space (a 54-point constellation of concepts). ';
  ab += 'Procrustes analysis takes the framed shape and rotates, flips, and scales it to align as closely as possible with the unframed shape. ';
  ab += 'The <strong>normalized distance</strong> is what\'s left over after the best possible alignment. ';
  ab += 'Low distance (near 0) means the framing only shifted or stretched the shape uniformly. ';
  ab += 'High distance means the shape itself changed in ways rotation and scaling can\'t fix.';
  ab += annoExample('The scatter plot shows absolute drift (x) vs structural distance (y). ' +
    '<strong>Lower-left</strong> = stable. <strong>Upper-right</strong> = deep reorganization. ' +
    '<strong>Lower-right</strong> = scale shift (moved a lot but structure preserved). ' +
    '<strong>Upper-left</strong> = structural change despite small rating movements (most concerning).');

  var h = annotation(ab);

  // Pull drift data from report
  var driftData = {};
  if (window._report) {
    for (var si = 0; si < window._report.sections.length; si++) {
      if (window._report.sections[si].type === 'drift_analysis') {
        driftData = window._report.sections[si].data;
        break;
      }
    }
  }

  // Assign colors to models
  var modelColors = {};
  for (var i = 0; i < s.models.length; i++) {
    modelColors[s.models[i]] = MODEL_PALETTE[i % MODEL_PALETTE.length];
  }

  // Collect scatter points
  var points = [];
  var maxX = 0, maxY = 0;
  for (var i = 0; i < s.models.length; i++) {
    var model = s.models[i];
    var pd = s.data[model] || {};
    var dd = driftData[model] || {};
    for (var j = 0; j < framings.length; j++) {
      var f = framings[j];
      var proc = (pd[f] || {}).normalized_distance;
      var drift = (dd[f] || {}).abs_drift;
      if (proc != null && drift != null) {
        points.push({model: model, framing: f, drift: drift, proc: proc});
        if (drift > maxX) maxX = drift;
        if (proc > maxY) maxY = proc;
      }
    }
  }

  // SVG scatter
  var W = 900, H = 460;
  var PAD = {top: 20, right: 30, bottom: 50, left: 60};
  var plotW = W - PAD.left - PAD.right;
  var plotH = H - PAD.top - PAD.bottom;
  var xMax = Math.ceil(maxX * 5) / 5 + 0.1;
  var yMax = Math.ceil(maxY * 5) / 5 + 0.05;

  h += '<svg id="procrustes-svg" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:' + W + 'px;display:block;margin:1rem 0" xmlns="http://www.w3.org/2000/svg">';

  // Grid
  for (var gx = 0; gx <= xMax + 0.01; gx += 0.2) {
    var x = PAD.left + (gx / xMax) * plotW;
    h += '<line x1="' + x + '" y1="' + PAD.top + '" x2="' + x + '" y2="' + (PAD.top + plotH) + '" stroke="#2a2a40" stroke-width="0.5"/>';
    h += '<text x="' + x + '" y="' + (H - 15) + '" text-anchor="middle" fill="#7a7a90" font-size="10">' + gx.toFixed(1) + '</text>';
  }
  for (var gy = 0; gy <= yMax + 0.01; gy += 0.1) {
    var y = PAD.top + plotH - (gy / yMax) * plotH;
    h += '<line x1="' + PAD.left + '" y1="' + y + '" x2="' + (PAD.left + plotW) + '" y2="' + y + '" stroke="#2a2a40" stroke-width="0.5"/>';
    h += '<text x="' + (PAD.left - 8) + '" y="' + (y + 3) + '" text-anchor="end" fill="#7a7a90" font-size="10">' + gy.toFixed(1) + '</text>';
  }

  // Axes
  h += '<line x1="' + PAD.left + '" y1="' + (PAD.top + plotH) + '" x2="' + (PAD.left + plotW) + '" y2="' + (PAD.top + plotH) + '" stroke="#7a7a90"/>';
  h += '<line x1="' + PAD.left + '" y1="' + PAD.top + '" x2="' + PAD.left + '" y2="' + (PAD.top + plotH) + '" stroke="#7a7a90"/>';
  h += '<text x="' + (PAD.left + plotW / 2) + '" y="' + (H - 2) + '" text-anchor="middle" fill="#7a7a90" font-size="11">Absolute Drift</text>';
  h += '<text x="14" y="' + (PAD.top + plotH / 2) + '" text-anchor="middle" fill="#7a7a90" font-size="11" transform="rotate(-90,14,' + (PAD.top + plotH / 2) + ')">Structural Distance</text>';

  // Points
  for (var pi = 0; pi < points.length; pi++) {
    var p = points[pi];
    var cx = PAD.left + (p.drift / xMax) * plotW;
    var cy = PAD.top + plotH - (p.proc / yMax) * plotH;
    var color = modelColors[p.model];
    var isNonsense = nonsenseFramings.indexOf(p.framing) !== -1;
    var nonsenseIdx = nonsenseFramings.indexOf(p.framing);
    var r = isNonsense ? 6 : 4;
    var opacity = isNonsense ? 0.7 : 0.35;
    var tip = p.model + ' / ' + p.framing + '&#10;Drift: ' + p.drift.toFixed(3) + ', Struct: ' + p.proc.toFixed(4);

    if (nonsenseIdx === 0) {
      // Diamond for first nonsense framing
      var pts = cx + ',' + (cy - r) + ' ' + (cx + r) + ',' + cy + ' ' + cx + ',' + (cy + r) + ' ' + (cx - r) + ',' + cy;
      h += '<polygon points="' + pts + '" fill="' + color + '" fill-opacity="' + opacity + '" stroke="' + color + '" stroke-width="2" data-model="' + p.model + '"><title>' + tip + '</title></polygon>';
    } else if (nonsenseIdx >= 1) {
      // Square for second+ nonsense framing
      h += '<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (r * 2) + '" height="' + (r * 2) + '" fill="' + color + '" fill-opacity="' + opacity + '" stroke="' + color + '" stroke-width="2" data-model="' + p.model + '"><title>' + tip + '</title></rect>';
    } else {
      // Circle for cultural framings
      h += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '" fill-opacity="' + opacity + '" stroke="' + color + '" data-model="' + p.model + '"><title>' + tip + '</title></circle>';
    }
  }
  h += '</svg>';

  // Model toggles
  h += '<div class="scatter-legend">';
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i];
    h += '<button class="proc-toggle active" data-model="' + m + '" onclick="toggleProcModel(this)" style="background:none;border:1px solid ' + modelColors[m] + ';color:var(--text);padding:0.2rem 0.6rem;border-radius:4px;font-size:0.75rem;cursor:pointer;display:flex;align-items:center;gap:0.3rem;font-family:inherit">';
    h += '<span style="width:10px;height:10px;border-radius:2px;display:inline-block;background:' + modelColors[m] + '"></span>' + m + '</button>';
  }
  h += '</div>';
  h += '<div class="scatter-shapes">';
  h += '<span style="margin-right:1rem">&#9679; Cultural framings (faded)</span>';
  var shapeSymbols = ['&#9670;', '&#9632;', '&#9650;'];
  var shapeNames = ['diamond', 'square', 'triangle'];
  for (var ni = 0; ni < nonsenseFramings.length; ni++) {
    var sym = shapeSymbols[ni % shapeSymbols.length];
    var sname = shapeNames[ni % shapeNames.length];
    h += '<span style="margin-right:1rem">' + sym + ' ' + nonsenseFramings[ni].charAt(0).toUpperCase() + nonsenseFramings[ni].slice(1) + ' (' + sname + ')</span>';
  }
  h += '</div>';

  // Raw table behind toggle
  h += '<details><summary style="font-size:0.8rem;color:var(--dim);cursor:pointer">Show raw distance table</summary>';
  var procVals = collectValues(s.data, s.models, framings, 'normalized_distance');
  var procMax = procVals.length ? Math.max.apply(null, procVals) : 1;
  h += '<table style="margin-top:0.5rem"><tr><th>Model</th>';
  for (var j = 0; j < framings.length; j++) h += '<th class="num">' + framings[j].substring(0, 8) + '</th>';
  h += '</tr>';
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i], md = s.data[m] || {};
    h += '<tr><td class="model">' + m + '</td>';
    for (var j = 0; j < framings.length; j++) {
      var v = (md[framings[j]] || {}).normalized_distance;
      h += '<td class="heat" style="background:' + heatColor(v, 0, procMax) + '">' + (v != null ? v.toFixed(4) : '--') + '</td>';
    }
    h += '</tr>';
  }
  h += '</table></details>';

  return h;
}

/* -----------------------------------------------------------------------
 * Section: Variance Comparison
 * ----------------------------------------------------------------------- */

function renderVariance(s) {
  var nonsenseFramings = getNonsenseFramings();
  var firstNF = nonsenseFramings[0] || 'geometric';

  var maxModel = '', maxRatio = 0;
  for (var i = 0; i < s.models.length; i++) {
    var nfr = ((s.data[s.models[i]] || {})[firstNF] || {}).ratio_to_unframed;
    if (nfr != null && nfr > maxRatio) { maxRatio = nfr; maxModel = s.models[i]; }
  }

  var ab = 'Each model produces a spread of ratings from 1 to 7. <strong>Variance</strong> measures how wide that spread is. ';
  ab += 'The <strong>ratio to unframed</strong> tells you whether framing makes the model more or less certain. ';
  ab += 'Ratio &gt; 1.0 means ratings spread out more under framing (model is less certain, hedging). ';
  ab += 'Ratio &lt; 1.0 means ratings compress toward the mean (model becomes more uniform). ';
  ab += 'Ratio near 1.0 means the spread didn\'t change, only the center shifted.';
  ab += annoExample('<strong>' + maxModel + '</strong> has a ' + firstNF + ' variance ratio of ' + maxRatio.toFixed(4) + ', ' +
    'meaning its ratings spread out ' + ((maxRatio - 1) * 100).toFixed(0) + '% more under ' + firstNF + ' framing. ' +
    'The model became less certain about its similarity judgments when processing the nonsense frame.');

  var h = annotation(ab);

  // Find max deviation from 1.0 for scale
  var maxDev = 0.05;
  for (var i = 0; i < s.models.length; i++) {
    var md = s.data[s.models[i]] || {};
    for (var ni = 0; ni < nonsenseFramings.length; ni++) {
      var r = (md[nonsenseFramings[ni]] || {}).ratio_to_unframed;
      if (r != null) maxDev = Math.max(maxDev, Math.abs(r - 1));
    }
  }
  maxDev = Math.ceil(maxDev * 10) / 10;

  // Assign model colors
  var modelColors = {};
  for (var i = 0; i < s.models.length; i++) {
    modelColors[s.models[i]] = MODEL_PALETTE[i % MODEL_PALETTE.length];
  }

  // Header labels
  h += '<div style="display:grid;grid-template-columns:140px 70px 1fr 50px;gap:0.25rem;margin-bottom:0.5rem;font-size:0.72rem;color:var(--dim)">';
  h += '<div></div><div></div>';
  h += '<div style="display:flex;justify-content:space-between">';
  h += '<span>\u2190 More certain</span><span style="color:var(--border)">1.0</span><span>Less certain \u2192</span>';
  h += '</div><div></div></div>';

  // One row per model per nonsense framing
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i];
    var md = s.data[m] || {};
    var color = modelColors[m];

    for (var pi = 0; pi < nonsenseFramings.length; pi++) {
      var nfName = nonsenseFramings[pi];
      var nfLabel = nfName.charAt(0).toUpperCase() + nfName.slice(1);
      var ratio = (md[nfName] || {}).ratio_to_unframed;
      var dev = ratio != null ? ratio - 1 : 0;
      var pct = Math.abs(dev) / maxDev * 50;
      var isFirst = pi === 0;
      var isLast = pi === nonsenseFramings.length - 1;

      h += '<div style="display:grid;grid-template-columns:140px 70px 1fr 50px;gap:0.25rem;align-items:center;margin-bottom:' + (isLast ? '0.75rem' : '1px') + '">';

      // Model name (only on first row)
      h += '<div style="font-size:0.8rem;font-weight:' + (isFirst ? '600' : '400') + ';text-align:right;padding-right:0.5rem;color:' + (isFirst ? color : 'transparent') + '">' + (isFirst ? m : m) + '</div>';

      // Framing label
      h += '<div style="font-size:0.7rem;color:var(--dim);text-align:right;padding-right:0.5rem;font-family:var(--mono)">' + nfLabel + '</div>';

      // Diverging bar
      h += '<div style="position:relative;height:18px;background:var(--surface)">';
      // Center line
      h += '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--border);z-index:2"></div>';

      if (ratio != null && dev !== 0) {
        if (dev > 0) {
          // Bar extends right from center
          h += '<div style="position:absolute;left:50%;top:1px;bottom:1px;width:' + pct + '%;background:' + color + ';opacity:' + (pi === 0 ? '0.7' : '0.4') + ';border-radius:0 2px 2px 0"></div>';
        } else {
          // Bar extends left from center
          h += '<div style="position:absolute;right:50%;top:1px;bottom:1px;width:' + pct + '%;background:' + color + ';opacity:' + (pi === 0 ? '0.7' : '0.4') + ';border-radius:2px 0 0 2px"></div>';
        }
      }
      h += '</div>';

      // Ratio value
      var valColor = ratio != null ? (ratio > 1.1 ? 'var(--warning)' : ratio < 0.9 ? 'var(--accent2)' : 'var(--dim)') : 'var(--dim)';
      h += '<div style="font-size:0.72rem;font-family:var(--mono);text-align:right;color:' + valColor + '">' + (ratio != null ? ratio.toFixed(3) : '--') + '</div>';

      h += '</div>';
    }
  }

  // Raw table behind toggle
  h += '<details style="margin-top:1.5rem"><summary style="font-size:0.8rem;color:var(--dim);cursor:pointer">Show raw variance table</summary>';
  h += '<table style="margin-top:0.5rem"><tr><th>Model</th><th class="num">Unframed</th>';
  for (var ni = 0; ni < nonsenseFramings.length; ni++) {
    var nfCap = nonsenseFramings[ni].charAt(0).toUpperCase() + nonsenseFramings[ni].slice(1);
    h += '<th class="num">' + nfCap + '</th><th class="num">' + nfCap.substring(0, 3) + ' Ratio</th>';
  }
  h += '</tr>';
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i], md = s.data[m] || {};
    var uf = md.unframed || {};
    h += '<tr><td class="model">' + m + '</td>';
    h += '<td class="num">' + (uf.variance != null ? uf.variance.toFixed(4) : '--') + '</td>';
    for (var ni = 0; ni < nonsenseFramings.length; ni++) {
      var nfd = md[nonsenseFramings[ni]] || {};
      h += '<td class="num">' + (nfd.variance != null ? nfd.variance.toFixed(4) : '--') + '</td>';
      var r = nfd.ratio_to_unframed;
      var rc = r != null ? (r > 1.1 ? 'var(--warning)' : r < 0.9 ? 'var(--accent2)' : 'var(--dim)') : 'var(--dim)';
      h += '<td class="num" style="color:' + rc + '">' + (r != null ? r.toFixed(4) : '--') + '</td>';
    }
    h += '</tr>';
  }
  h += '</table></details>';
  return h;
}

/* -----------------------------------------------------------------------
 * FSI updater (called by model dropdown)
 * ----------------------------------------------------------------------- */

function updateFSI() {
  var model = document.getElementById('fsi-model').value;
  var s = window._fsiData;
  var domains = window._fsiDomains;
  var framings = s.framings;
  var modelData = s.data[model] || {};

  // Group by domain, compute mean FSI
  var byDomain = {physical: [], institutional: [], moral: []};
  for (var i = 0; i < s.concepts.length; i++) {
    var c = s.concepts[i];
    var cd = modelData[c] || {};
    var dom = domains[c] || 'physical';
    var vals = [];
    for (var j = 0; j < framings.length; j++) {
      var v = cd[framings[j]];
      if (v != null) vals.push(v);
    }
    var meanFSI = vals.length > 0 ? vals.reduce(function(a, b) { return a + b; }, 0) / vals.length : 0;
    byDomain[dom].push({concept: c, data: cd, meanFSI: meanFSI});
  }

  // Sort descending within each domain
  for (var d in byDomain) {
    byDomain[d].sort(function(a, b) { return b.meanFSI - a.meanFSI; });
  }

  // Global max for consistent bar scale
  var maxVal = 0.5;
  for (var d in byDomain) {
    for (var i = 0; i < byDomain[d].length; i++) {
      for (var j = 0; j < framings.length; j++) {
        var v = byDomain[d][i].data[framings[j]];
        if (v != null && v > maxVal) maxVal = v;
      }
    }
  }

  var gridCols = '150px repeat(' + framings.length + ', 1fr) 55px';

  // Column header
  var h = '<div class="fsi-grid">';
  h += '<div class="fsi-grid-header" style="grid-template-columns:' + gridCols + '">';
  h += '<div class="fsi-grid-label"></div>';
  for (var j = 0; j < framings.length; j++) {
    h += '<div class="fsi-grid-col-header" style="color:' + FSI_COLORS[framings[j]] + '">' + framings[j].substring(0, 5) + '</div>';
  }
  h += '<div class="fsi-grid-mean-header">Mean</div>';
  h += '</div>';

  // Domain panels
  var domainLabels = {physical: 'Physical (Control)', institutional: 'Institutional', moral: 'Moral'};
  var domainColors = {physical: 'var(--accent2)', institutional: 'var(--warning)', moral: 'var(--accent)'};
  var domainOrder = ['physical', 'institutional', 'moral'];

  for (var di = 0; di < domainOrder.length; di++) {
    var dom = domainOrder[di];
    var concepts = byDomain[dom];
    h += '<div class="fsi-grid-domain" style="border-left:3px solid ' + domainColors[dom] + ';padding-left:0.5rem;margin:1.2rem 0 0.4rem">';
    h += '<span style="color:' + domainColors[dom] + ';font-weight:700;font-size:0.85rem">' + domainLabels[dom] + '</span></div>';

    for (var ci = 0; ci < concepts.length; ci++) {
      var entry = concepts[ci];
      var c = entry.concept;
      var cd = entry.data;

      h += '<div class="fsi-grid-row" style="grid-template-columns:' + gridCols + '">';
      h += '<div class="fsi-grid-label">' + c + '</div>';

      for (var j = 0; j < framings.length; j++) {
        var f = framings[j];
        var v = cd[f];
        var barPct = v != null ? (v / maxVal) * 100 : 0;
        var color = FSI_COLORS[f];

        h += '<div class="fsi-grid-cell">';
        if (v != null && v > 0) {
          h += '<div class="fsi-grid-bar" style="width:' + Math.max(2, barPct) + '%;background:' + color + '" title="' + f + ': ' + v.toFixed(3) + '">';
          if (barPct > 25) {
            h += '<span class="fsi-grid-bar-label">' + v.toFixed(2) + '</span>';
          }
          h += '</div>';
        }
        h += '</div>';
      }

      h += '<div class="fsi-grid-mean">' + entry.meanFSI.toFixed(2) + '</div>';
      h += '</div>';
    }
  }
  h += '</div>';

  // Raw table behind toggle
  h += '<details style="margin-top:1rem"><summary style="font-size:0.8rem;color:var(--dim);cursor:pointer">Show raw heatmap table</summary>';
  h += '<table style="font-size:0.72rem;margin-top:0.5rem"><tr><th>Concept</th><th>Domain</th>';
  for (var j = 0; j < framings.length; j++) h += '<th class="num">' + framings[j].substring(0, 6) + '</th>';
  h += '</tr>';
  var sorted = s.concepts.slice().sort(function(a, b) {
    var da = domains[a] || '', db = domains[b] || '';
    var order = {physical: 0, institutional: 1, moral: 2};
    if (da !== db) return (order[da] || 0) - (order[db] || 0);
    return a.localeCompare(b);
  });
  for (var i = 0; i < sorted.length; i++) {
    var c = sorted[i];
    var cd = modelData[c] || {};
    var dom = domains[c] || '?';
    h += '<tr><td style="font-weight:600">' + c + '</td>';
    h += '<td><span class="tag tag-' + dom + '">' + dom + '</span></td>';
    for (var j = 0; j < framings.length; j++) {
      var v = cd[framings[j]];
      h += '<td class="heat" style="background:' + heatColor(v, 0, 2.0) + ';font-size:0.7rem">' + (v != null ? v.toFixed(2) : '') + '</td>';
    }
    h += '</tr>';
  }
  h += '</table></details>';

  document.getElementById('fsi-table').innerHTML = h;
}

/* -----------------------------------------------------------------------
 * Section: Explanation Viewer (lazy-loaded)
 * ----------------------------------------------------------------------- */

function renderExplanations(s) {
  var ab = 'Browse individual model explanations for any concept pair. ';
  ab += '<strong>Filter</strong> by model, framing, domain, or search for a concept. ';
  ab += 'This is the raw evidence behind the aggregate statistics. ';
  ab += 'Explanations are loaded on demand to keep the dashboard fast.';
  ab += annoExample(s.count.toLocaleString() + ' total explanations across all models and framings. ' +
    'Click "Load Explanations" below to begin browsing.');

  var h = annotation(ab);
  h += '<div id="explanation-viewer">';
  h += '<button onclick="loadExplanations()" style="background:var(--accent2);color:var(--bg);border:none;padding:0.5rem 1.5rem;border-radius:4px;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:inherit">';
  h += 'Load Explanations (' + (s.count / 1000).toFixed(0) + 'k entries)</button>';
  h += '</div>';
  return h;
}

var _explanations = null;
var _expFilters = {model: '', frame: '', domain: '', search: ''};
var _expPage = 0;
var EXP_PAGE_SIZE = 30;

function loadExplanations() {
  var container = document.getElementById('explanation-viewer');
  container.innerHTML = '<div style="color:var(--dim);padding:1rem">Loading explanations...</div>';

  var dataFile = 'explanations.json';
  fetch(dataFile)
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' - run split_report.py first');
      return r.json();
    })
    .then(function(data) {
      _explanations = data;
      // Extract unique values for filters
      var models = {}, frames = {}, domains = {};
      for (var i = 0; i < data.length; i++) {
        models[data[i].model] = true;
        frames[data[i].frame] = true;
        domains[data[i].domain_a] = true;
        domains[data[i].domain_b] = true;
      }
      window._expModels = Object.keys(models).sort();
      window._expFrames = Object.keys(frames).sort();
      window._expDomains = Object.keys(domains).sort();
      _expPage = 0;
      renderExpFilters();
      renderExpResults();
    })
    .catch(function(err) {
      container.innerHTML = '<div style="color:var(--accent);padding:1rem">Failed to load: ' + err.message + '</div>';
    });
}

function renderExpFilters() {
  var container = document.getElementById('explanation-viewer');
  var h = '<div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem">';

  // Model filter
  h += '<select id="exp-model" onchange="expFilterChanged()" style="background:var(--surface);color:var(--text);border:1px solid var(--border);padding:0.3rem 0.5rem;border-radius:4px;font-size:0.8rem">';
  h += '<option value="">All models</option>';
  for (var i = 0; i < window._expModels.length; i++) {
    var m = window._expModels[i];
    h += '<option value="' + m + '"' + (_expFilters.model === m ? ' selected' : '') + '>' + m + '</option>';
  }
  h += '</select>';

  // Frame filter
  h += '<select id="exp-frame" onchange="expFilterChanged()" style="background:var(--surface);color:var(--text);border:1px solid var(--border);padding:0.3rem 0.5rem;border-radius:4px;font-size:0.8rem">';
  h += '<option value="">All framings</option>';
  for (var i = 0; i < window._expFrames.length; i++) {
    var f = window._expFrames[i];
    h += '<option value="' + f + '"' + (_expFilters.frame === f ? ' selected' : '') + '>' + f + '</option>';
  }
  h += '</select>';

  // Domain filter
  h += '<select id="exp-domain" onchange="expFilterChanged()" style="background:var(--surface);color:var(--text);border:1px solid var(--border);padding:0.3rem 0.5rem;border-radius:4px;font-size:0.8rem">';
  h += '<option value="">All domains</option>';
  for (var i = 0; i < window._expDomains.length; i++) {
    var d = window._expDomains[i];
    h += '<option value="' + d + '"' + (_expFilters.domain === d ? ' selected' : '') + '>' + d + '</option>';
  }
  h += '</select>';

  // Search
  h += '<input id="exp-search" type="text" placeholder="Search concept..." value="' + (_expFilters.search || '') + '" ';
  h += 'oninput="expFilterChanged()" ';
  h += 'style="background:var(--surface);color:var(--text);border:1px solid var(--border);padding:0.3rem 0.5rem;border-radius:4px;font-size:0.8rem;width:160px">';

  h += '</div>';
  h += '<div id="exp-results"></div>';
  container.innerHTML = h;
}

function expFilterChanged() {
  _expFilters.model = document.getElementById('exp-model').value;
  _expFilters.frame = document.getElementById('exp-frame').value;
  _expFilters.domain = document.getElementById('exp-domain').value;
  _expFilters.search = document.getElementById('exp-search').value.toLowerCase();
  _expPage = 0;
  renderExpResults();
}

function getFilteredExplanations() {
  var f = _expFilters;
  var results = [];
  for (var i = 0; i < _explanations.length; i++) {
    var e = _explanations[i];
    if (f.model && e.model !== f.model) continue;
    if (f.frame && e.frame !== f.frame) continue;
    if (f.domain && e.domain_a !== f.domain && e.domain_b !== f.domain) continue;
    if (f.search && e.concept_a.toLowerCase().indexOf(f.search) === -1 && e.concept_b.toLowerCase().indexOf(f.search) === -1) continue;
    results.push(e);
  }
  return results;
}

function renderExpResults() {
  var filtered = getFilteredExplanations();
  var end = Math.min((_expPage + 1) * EXP_PAGE_SIZE, filtered.length);
  var showing = filtered.slice(0, end);

  var h = '<div style="font-size:0.78rem;color:var(--dim);margin-bottom:0.75rem">';
  h += 'Showing ' + showing.length + ' of ' + filtered.length.toLocaleString() + ' explanations';
  h += '</div>';

  // Assign model colors
  var modelColors = {};
  var models = window._report ? window._report.models : window._expModels;
  for (var i = 0; i < models.length; i++) {
    modelColors[models[i]] = MODEL_PALETTE[i % MODEL_PALETTE.length];
  }

  for (var i = 0; i < showing.length; i++) {
    var e = showing[i];
    var color = modelColors[e.model] || 'var(--dim)';
    h += '<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ' + color + ';border-radius:4px;padding:0.75rem 1rem;margin-bottom:0.5rem">';

    // Header row: concepts + tags
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">';
    h += '<span style="font-weight:600;font-size:0.85rem">' + e.concept_a + ' \u2194 ' + e.concept_b + '</span>';
    h += '<span style="display:flex;gap:0.3rem;align-items:center">';
    h += '<span class="tag tag-' + e.domain_a + '">' + e.domain_a + '</span>';
    if (e.domain_a !== e.domain_b) h += '<span class="tag tag-' + e.domain_b + '">' + e.domain_b + '</span>';
    h += '</span>';
    h += '</div>';

    // Model + framing + rating
    h += '<div style="display:flex;gap:1rem;align-items:center;margin-bottom:0.4rem;font-size:0.75rem">';
    h += '<span style="color:' + color + ';font-weight:600">' + e.model + '</span>';
    h += '<span style="color:var(--dim)">' + e.frame + '</span>';
    h += '<span style="background:var(--surface2);padding:0.1rem 0.4rem;border-radius:3px;font-family:var(--mono);font-weight:600">Rating: ' + e.rating + '</span>';
    h += '</div>';

    // Explanation
    h += '<div style="font-size:0.82rem;color:var(--text);line-height:1.5">' + esc(e.explanation) + '</div>';
    h += '</div>';
  }

  if (end < filtered.length) {
    h += '<button onclick="_expPage++;renderExpResults()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);padding:0.4rem 1.2rem;border-radius:4px;font-size:0.8rem;cursor:pointer;margin-top:0.5rem;font-family:inherit">';
    h += 'Show more (' + (filtered.length - end).toLocaleString() + ' remaining)</button>';
  }

  document.getElementById('exp-results').innerHTML = h;
}

/* -----------------------------------------------------------------------
 * Procrustes model toggle (called by scatter toggle buttons)
 * ----------------------------------------------------------------------- */

function toggleProcModel(btn) {
  var model = btn.getAttribute('data-model');
  var svg = document.getElementById('procrustes-svg');
  if (!svg) return;
  var els = svg.querySelectorAll('[data-model="' + model + '"]');
  var isActive = btn.classList.toggle('active');
  var swatch = btn.querySelector('span');
  if (isActive) {
    btn.style.opacity = '1';
    if (swatch) swatch.style.opacity = '1';
    els.forEach(function(el) { el.style.display = ''; });
  } else {
    btn.style.opacity = '0.3';
    if (swatch) swatch.style.opacity = '0.3';
    els.forEach(function(el) { el.style.display = 'none'; });
  }
}

function toggleDriftModel(btn) {
  var model = btn.getAttribute('data-model');
  var isActive = btn.classList.toggle('active');
  var swatch = btn.querySelector('span');
  if (isActive) {
    btn.style.opacity = '1';
    if (swatch) swatch.style.opacity = '1';
  } else {
    btn.style.opacity = '0.3';
    if (swatch) swatch.style.opacity = '0.3';
  }
  // Toggle dots across all drift strip SVGs
  var svgs = document.querySelectorAll('[id^="drift-strip-"]');
  svgs.forEach(function(svg) {
    var els = svg.querySelectorAll('[data-model="' + model + '"]');
    els.forEach(function(el) { el.style.display = isActive ? '' : 'none'; });
  });
}

var _driftHighlightRow = -1;
function highlightDriftRow(rowIdx) {
  var highlights = document.querySelectorAll('.drift-row-highlight');
  if (_driftHighlightRow === rowIdx) {
    // Click same row again: deselect
    highlights.forEach(function(el) { el.setAttribute('opacity', '0'); });
    _driftHighlightRow = -1;
  } else {
    // Highlight selected row, dim others
    highlights.forEach(function(el) {
      var r = parseInt(el.getAttribute('data-row'));
      el.setAttribute('opacity', r === rowIdx ? '0.08' : '0');
    });
    _driftHighlightRow = rowIdx;
  }
}

var _tempHighlightRow = -1;
function highlightTempRow(rowIdx) {
  var highlights = document.querySelectorAll('.temp-row-highlight');
  if (_tempHighlightRow === rowIdx) {
    highlights.forEach(function(el) { el.setAttribute('opacity', '0'); });
    _tempHighlightRow = -1;
  } else {
    highlights.forEach(function(el) {
      var r = parseInt(el.getAttribute('data-row'));
      el.setAttribute('opacity', r === rowIdx ? '0.08' : '0');
    });
    _tempHighlightRow = rowIdx;
  }
}

/* -----------------------------------------------------------------------
 * Section: Permutation Tests
 * ----------------------------------------------------------------------- */

function renderPermutation(s) {
  var models = s.models;
  var data = s.data;

  // Annotation
  var ab = '<strong>Domain ordering test:</strong> does each model show the hypothesized pattern where physical concepts drift least, moral concepts drift most, and institutional concepts fall in between? ';
  ab += 'Each dot shows the mean cultural drift for all concepts in that domain. The gaps between dots are the effect sizes. ';
  ab += '<strong>Significance</strong> is assessed by shuffling domain labels 50,000 times and counting how often the shuffled difference matches or exceeds the observed difference. ';
  ab += 'Stars use BH-corrected p-values: *** p&lt;0.001, ** p&lt;0.01, * p&lt;0.05.';
  ab += annoExample('The pre-registered ordinal test (is the exact P&lt;I&lt;M ordering significant?) is structurally flat at ~16.7% for all orderings regardless of effect size. ' +
    'The magnitude tests below ask the more useful question: is each pairwise domain difference larger than chance?');
  var h = annotation(ab);

  // Assign model colors
  var modelColors = {};
  for (var i = 0; i < models.length; i++) {
    modelColors[models[i]] = MODEL_PALETTE[i % MODEL_PALETTE.length];
  }

  var domains = ['physical', 'institutional', 'moral'];
  var domColors = DOMAIN_COLORS;
  var domOffsets = {physical: -8, institutional: 0, moral: 8};
  var domLabels = {physical: 'Physical', institutional: 'Institutional', moral: 'Moral'};

  // Find global max domain mean for axis
  var globalMax = 0.3;
  for (var i = 0; i < models.length; i++) {
    var dm = data[models[i]].domain_means;
    for (var di = 0; di < domains.length; di++) {
      var v = dm[domains[di]];
      if (v != null && v > globalMax) globalMax = v;
    }
  }
  globalMax = Math.ceil(globalMax * 5) / 5 + 0.1;

  // SVG dimensions
  var ROW_H = 36;
  var PAD = {top: 18, right: 30, bottom: 35, left: 8};
  var PLOT_W = 500;
  var panelW = PAD.left + PLOT_W + PAD.right;
  var labelW = 175;
  var sigW = 120;
  var panelH = PAD.top + models.length * ROW_H + PAD.bottom;

  h += '<div style="display:flex;gap:0;margin:1rem 0">';

  // Label column
  h += '<svg viewBox="0 0 ' + labelW + ' ' + panelH + '" style="width:' + labelW + 'px;display:block;flex:0 0 auto" xmlns="http://www.w3.org/2000/svg">';
  for (var mi = 0; mi < models.length; mi++) {
    var rowY = PAD.top + mi * ROW_H + ROW_H / 2;
    if (mi % 2 === 0) {
      h += '<rect x="0" y="' + (PAD.top + mi * ROW_H) + '" width="' + labelW + '" height="' + ROW_H + '" fill="#1a1a28" opacity="0.5"/>';
    }
    h += '<text x="' + (labelW - 6) + '" y="' + (rowY + 4) + '" text-anchor="end" fill="' + modelColors[models[mi]] + '" font-size="11" font-weight="600">' + models[mi] + '</text>';
  }
  h += '</svg>';

  // Main dot strip
  h += '<svg viewBox="0 0 ' + panelW + ' ' + panelH + '" style="width:' + panelW + 'px;max-width:100%;display:block;flex:0 0 auto" xmlns="http://www.w3.org/2000/svg">';

  // X-axis grid
  var nTicks = 6;
  for (var ti = 0; ti <= nTicks; ti++) {
    var xVal = (ti / nTicks) * globalMax;
    var xPos = PAD.left + (ti / nTicks) * PLOT_W;
    h += '<line x1="' + xPos + '" y1="' + PAD.top + '" x2="' + xPos + '" y2="' + (panelH - PAD.bottom) + '" stroke="#2a2a40" stroke-width="0.5"/>';
    h += '<text x="' + xPos + '" y="' + (panelH - 12) + '" text-anchor="middle" fill="#7a7a90" font-size="9">' + xVal.toFixed(2) + '</text>';
  }
  h += '<text x="' + (PAD.left + PLOT_W / 2) + '" y="' + (panelH - 1) + '" text-anchor="middle" fill="#7a7a90" font-size="10">Mean Cultural Drift</text>';

  for (var mi = 0; mi < models.length; mi++) {
    var model = models[mi];
    var md = data[model];
    var dm = md.domain_means;
    var rowY = PAD.top + mi * ROW_H + ROW_H / 2;

    // Row background
    if (mi % 2 === 0) {
      h += '<rect x="0" y="' + (PAD.top + mi * ROW_H) + '" width="' + panelW + '" height="' + ROW_H + '" fill="#1a1a28" opacity="0.5"/>';
    }

    // Connecting line between min and max domain dots
    var domVals = [];
    for (var di = 0; di < domains.length; di++) {
      if (dm[domains[di]] != null) domVals.push(dm[domains[di]]);
    }
    if (domVals.length >= 2) {
      var minX = PAD.left + (Math.min.apply(null, domVals) / globalMax) * PLOT_W;
      var maxX = PAD.left + (Math.max.apply(null, domVals) / globalMax) * PLOT_W;
      h += '<line x1="' + minX.toFixed(1) + '" y1="' + rowY + '" x2="' + maxX.toFixed(1) + '" y2="' + rowY + '" stroke="#3a3a55" stroke-width="1.5"/>';
    }

    // Domain dots
    for (var di = 0; di < domains.length; di++) {
      var dom = domains[di];
      var v = dm[dom];
      if (v == null) continue;
      var cx = PAD.left + (v / globalMax) * PLOT_W;
      var cy = rowY + domOffsets[dom];
      h += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy + '" r="5.5" fill="' + domColors[dom] + '" fill-opacity="0.85">';
      h += '<title>' + model + ' / ' + dom + ': ' + v.toFixed(4) + '</title></circle>';
    }
  }
  h += '</svg>';

  // Significance column
  h += '<svg viewBox="0 0 ' + sigW + ' ' + panelH + '" style="width:' + sigW + 'px;display:block;flex:0 0 auto" xmlns="http://www.w3.org/2000/svg">';
  // Header
  h += '<text x="4" y="' + (PAD.top - 4) + '" fill="var(--dim)" font-size="9">P &lt; I &lt; M</text>';
  for (var mi = 0; mi < models.length; mi++) {
    var md = data[models[mi]];
    var rowY = PAD.top + mi * ROW_H + ROW_H / 2;
    if (mi % 2 === 0) {
      h += '<rect x="0" y="' + (PAD.top + mi * ROW_H) + '" width="' + sigW + '" height="' + ROW_H + '" fill="#1a1a28" opacity="0.5"/>';
    }

    var comparisons = ['institutional_gt_physical', 'moral_gt_institutional', 'moral_gt_physical'];
    for (var ci = 0; ci < comparisons.length; ci++) {
      var comp = md.magnitude[comparisons[ci]];
      var p = comp.p_bh != null ? comp.p_bh : comp.p_value;
      var sig = p < 0.001 ? '***' : (p < 0.01 ? '**' : (p < 0.05 ? '*' : '\u2014'));
      var color = sig !== '\u2014' ? 'var(--success)' : '#2a2a40';
      var xOff = 8 + ci * 38;
      h += '<text x="' + xOff + '" y="' + (rowY + 4) + '" fill="' + color + '" font-size="10" font-weight="600" font-family="var(--mono)">' + sig + '</text>';
    }
  }
  h += '</svg>';

  h += '</div>';

  // Legend
  h += '<div style="display:flex;gap:1.5rem;font-size:0.78rem;margin:0.5rem 0 1rem">';
  for (var di = 0; di < domains.length; di++) {
    h += '<span style="display:flex;align-items:center;gap:0.3rem">';
    h += '<span style="width:10px;height:10px;border-radius:50%;background:' + domColors[domains[di]] + '"></span>';
    h += domLabels[domains[di]] + '</span>';
  }
  h += '<span style="color:var(--dim)">Line spans the domain range per model</span>';
  h += '</div>';

  // Collapsible raw tables
  h += '<details><summary style="font-size:0.8rem;color:var(--dim);cursor:pointer">Show raw permutation tables</summary>';

  // Ordinal test
  h += '<h3>Ordinal Test (Pre-registered)</h3>';
  h += '<p style="font-size:0.82rem;color:var(--dim);margin-bottom:0.5rem">This test is structurally insensitive: all six orderings occur at ~16.7% regardless of signal strength.</p>';
  h += '<table><tr><th>Model</th><th class="num">P&lt;I&lt;M p</th><th>Status</th></tr>';
  for (var i = 0; i < models.length; i++) {
    var d = data[models[i]];
    h += '<tr><td class="model">' + models[i] + '</td>';
    h += '<td class="num">' + d.ordinal_p.toFixed(4) + '</td>';
    h += '<td style="color:var(--text-dim)">~16.7% (structurally flat)</td></tr>';
  }
  h += '</table>';

  // Magnitude tests
  var compLabels = [
    {key: 'moral_gt_physical', label: 'Moral > Physical'},
    {key: 'institutional_gt_physical', label: 'Institutional > Physical'},
    {key: 'moral_gt_institutional', label: 'Moral > Institutional'}
  ];
  for (var ci = 0; ci < compLabels.length; ci++) {
    var comp = compLabels[ci];
    h += '<h3>Magnitude Test: ' + comp.label + '</h3>';
    h += '<table><tr><th>Model</th><th class="num">High</th><th class="num">Low</th><th class="num">Diff</th><th class="num">p-value</th><th class="num">p (BH)</th><th class="num">Sig</th></tr>';
    for (var i = 0; i < models.length; i++) {
      var d = data[models[i]].magnitude[comp.key];
      var sig = (d.p_bh || d.p_value) < 0.001 ? '***' : ((d.p_bh || d.p_value) < 0.01 ? '**' : ((d.p_bh || d.p_value) < 0.05 ? '*' : ''));
      var sigColor = sig ? 'var(--success)' : 'var(--text-dim)';
      h += '<tr><td class="model">' + models[i] + '</td>';
      h += '<td class="num">' + d.mean_high.toFixed(3) + '</td>';
      h += '<td class="num">' + d.mean_low.toFixed(3) + '</td>';
      h += '<td class="num">' + d.observed_difference.toFixed(3) + '</td>';
      h += '<td class="num">' + d.p_value.toFixed(4) + '</td>';
      h += '<td class="num">' + (d.p_bh != null ? d.p_bh.toFixed(4) : '--') + '</td>';
      h += '<td class="num" style="color:' + sigColor + ';font-weight:600">' + sig + '</td></tr>';
    }
    h += '</table>';
  }

  h += '<div style="margin-top:1rem;font-size:0.8rem;color:var(--text-dim)">';
  h += s.n_permutations.toLocaleString() + ' permutations, seed ' + s.seed + '</div>';

  h += '</details>';

  return h;
}

/* -----------------------------------------------------------------------
 * Section: Factor Analysis (PCA)
 * ----------------------------------------------------------------------- */

function renderPCA(s) {
  var models = s.models;
  var data = s.data;

  var ab = '<strong>PCA</strong> extracts the principal axes of variation in each model\'s unframed similarity judgments. ';
  ab += 'Each row in the similarity matrix is a concept\'s profile of similarity ratings to all other concepts. ';
  ab += 'If three domains are distinct, three components should emerge. ';
  ab += '<strong>Variance explained</strong> shows how much of the total variation each component captures. ';
  ab += '<strong>Primary domain</strong> is the domain whose concepts load most heavily on that component. ';
  ab += '<strong>Alignment</strong> is the percentage of concepts whose dominant component matches their domain.';
  ab += annoExample('The scatter plot below shows each concept as a dot positioned by its principal component scores, colored by domain. ' +
    'If the instrument works, you should see three colored clusters pulling apart. ' +
    'Misaligned concepts (loaded on the wrong component) appear as a colored dot sitting inside the wrong cluster.');
  var h = annotation(ab);

  // Store PCA data for the scatter updater
  window._pcaData = data;
  window._pcaModels = models;

  // Model selector for scatter
  h += '<div class="pca-selector"><label>Model: </label>';
  h += '<select id="pca-model" onchange="updatePCAScatter()">';
  for (var i = 0; i < models.length; i++) {
    h += '<option value="' + models[i] + '">' + models[i] + '</option>';
  }
  h += '</select></div>';
  h += '<div id="pca-scatter"></div>';

  // Variance explained table
  h += '<h3>Variance Explained</h3>';
  h += '<table><tr><th>Model</th><th class="num">PC1</th><th class="num">PC2</th><th class="num">PC3</th><th class="num">Cumulative</th><th>PC1 Domain</th><th>PC2 Domain</th><th class="num">Spatial Alignment</th></tr>';
  for (var i = 0; i < models.length; i++) {
    var d = data[models[i]];
    var ve = d.variance_explained;
    var cm = d.component_map;
    var align = d.alignment_rate !== null ? (d.alignment_fraction || '') + ' (' + (d.alignment_rate * 100).toFixed(1) + '%)' : 'N/A';
    h += '<tr><td class="model">' + models[i] + '</td>';
    h += '<td class="num">' + (ve[0] * 100).toFixed(1) + '%</td>';
    h += '<td class="num">' + (ve[1] * 100).toFixed(1) + '%</td>';
    h += '<td class="num">' + (ve[2] * 100).toFixed(1) + '%</td>';
    h += '<td class="num">' + (d.cumulative_3 * 100).toFixed(1) + '%</td>';
    h += '<td>' + cm.PC1.primary_domain + '</td>';
    h += '<td>' + cm.PC2.primary_domain + '</td>';
    h += '<td class="num">' + align + '</td></tr>';
  }
  h += '</table>';

  // Misaligned concepts per model (collapsible)
  h += '<h3>Misaligned Concepts (Spatial Clustering)</h3>';
  for (var i = 0; i < models.length; i++) {
    var d = data[models[i]];
    if (!d.misaligned || d.misaligned.length === 0) {
      h += '<p><strong>' + models[i] + '</strong>: all concepts aligned</p>';
      continue;
    }
    // Count by domain
    var bydomain = {};
    for (var j = 0; j < d.misaligned.length; j++) {
      var m = d.misaligned[j];
      if (!bydomain[m.domain]) bydomain[m.domain] = 0;
      bydomain[m.domain]++;
    }
    var domSummary = [];
    for (var dom in bydomain) domSummary.push(bydomain[dom] + ' ' + dom);

    h += '<details><summary><strong>' + models[i] + '</strong>: ';
    h += d.misaligned.length + ' misaligned (' + domSummary.join(', ') + ')</summary>';
    h += '<table><tr><th>Concept</th><th>Domain</th><th>Clustered With</th></tr>';
    for (var j = 0; j < d.misaligned.length; j++) {
      var m = d.misaligned[j];
      h += '<tr><td>' + m.concept + '</td><td>' + m.domain + '</td><td>' + (m.clustered_with || m.loaded_on || '?') + '</td></tr>';
    }
    h += '</table></details>';
  }

  return h;
}

/* -----------------------------------------------------------------------
 * PCA Scatter Plot updater (called by model dropdown)
 * ----------------------------------------------------------------------- */

var PCA_DOMAIN_COLORS = DOMAIN_COLORS;

function updatePCAScatter() {
  var model = document.getElementById('pca-model').value;
  var d = window._pcaData[model];
  if (!d || !d.concept_coords) {
    document.getElementById('pca-scatter').innerHTML = '<p style="color:var(--dim)">No coordinate data for this model.</p>';
    return;
  }

  var coords = d.concept_coords;
  var misalignedSet = {};
  if (d.misaligned) {
    for (var i = 0; i < d.misaligned.length; i++) {
      misalignedSet[d.misaligned[i].concept] = d.misaligned[i].clustered_with || d.misaligned[i].loaded_on || '?';
    }
  }

  var ve = d.variance_explained || [];
  var veLabels = {
    pc1: ve[0] ? 'PC1 (' + (ve[0] * 100).toFixed(1) + '%)' : 'PC1',
    pc2: ve[1] ? 'PC2 (' + (ve[1] * 100).toFixed(1) + '%)' : 'PC2',
    pc3: ve[2] ? 'PC3 (' + (ve[2] * 100).toFixed(1) + '%)' : 'PC3'
  };

  // Normalize coordinates to [-1, 1]
  var bounds = {pc1: {min: Infinity, max: -Infinity}, pc2: {min: Infinity, max: -Infinity}, pc3: {min: Infinity, max: -Infinity}};
  for (var i = 0; i < coords.length; i++) {
    for (var k in bounds) {
      if (coords[i][k] < bounds[k].min) bounds[k].min = coords[i][k];
      if (coords[i][k] > bounds[k].max) bounds[k].max = coords[i][k];
    }
  }
  var norm = [];
  for (var i = 0; i < coords.length; i++) {
    var c = coords[i];
    norm.push({
      x: bounds.pc1.max > bounds.pc1.min ? (c.pc1 - (bounds.pc1.min + bounds.pc1.max) / 2) / ((bounds.pc1.max - bounds.pc1.min) / 2) : 0,
      y: bounds.pc2.max > bounds.pc2.min ? (c.pc2 - (bounds.pc2.min + bounds.pc2.max) / 2) / ((bounds.pc2.max - bounds.pc2.min) / 2) : 0,
      z: bounds.pc3.max > bounds.pc3.min ? (c.pc3 - (bounds.pc3.min + bounds.pc3.max) / 2) / ((bounds.pc3.max - bounds.pc3.min) / 2) : 0,
      concept: c.concept,
      domain: c.domain
    });
  }

  var W = 680, H = 520;
  var dpr = window.devicePixelRatio || 1;
  var html = '<div style="position:relative;display:inline-block">';
  html += '<canvas id="pca-canvas" width="' + (W * dpr) + '" height="' + (H * dpr) + '" style="background:var(--surface);border-radius:6px;cursor:grab;width:' + W + 'px;height:' + H + 'px;max-width:100%"></canvas>';
  html += '<div id="pca-tooltip" style="position:absolute;display:none;background:rgba(20,20,30,0.92);color:#eee;padding:4px 10px;border-radius:4px;font-size:0.78rem;pointer-events:none;white-space:nowrap;font-family:var(--mono)"></div>';
  html += '</div>';
  html += '<div style="font-size:0.75rem;color:var(--dim);margin-top:0.3rem">Click and drag to rotate</div>';

  // Legend
  html += '<div style="display:flex;gap:1.5rem;font-size:0.8rem;margin-top:0.5rem">';
  var domainLabels = {physical: 'Physical', institutional: 'Institutional', moral: 'Moral'};
  for (var dom in PCA_DOMAIN_COLORS) {
    html += '<span style="display:flex;align-items:center;gap:0.3rem">';
    html += '<span style="width:12px;height:12px;border-radius:50%;background:' + PCA_DOMAIN_COLORS[dom] + '"></span>';
    html += domainLabels[dom] + '</span>';
  }
  html += '<span style="display:flex;align-items:center;gap:0.3rem">';
  html += '<span style="width:12px;height:12px;border-radius:50%;background:#888;border:2px solid #fff"></span>';
  html += 'Misaligned (white ring)</span>';
  html += '</div>';

  document.getElementById('pca-scatter').innerHTML = html;

  // 3D rotation state
  var canvas = document.getElementById('pca-canvas');
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  var rotX = -0.5, rotY = 0.6;  // initial tilt
  var dragging = false, lastMX = 0, lastMY = 0;

  function rotatePoint(px, py, pz) {
    // Rotate around Y axis
    var cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    var x1 = px * cosY - pz * sinY;
    var z1 = px * sinY + pz * cosY;
    // Rotate around X axis
    var cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    var y1 = py * cosX - z1 * sinX;
    var z2 = py * sinX + z1 * cosX;
    return {x: x1, y: y1, z: z2};
  }

  function project(p3) {
    var scale = 200;
    var cx = W / 2, cy = H / 2;
    return {x: cx + p3.x * scale, y: cy - p3.y * scale, z: p3.z};
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw axis lines
    var axes = [
      {from: [-1.15,0,0], to: [1.15,0,0], label: veLabels.pc1},
      {from: [0,-1.15,0], to: [0,1.15,0], label: veLabels.pc2},
      {from: [0,0,-1.15], to: [0,0,1.15], label: veLabels.pc3}
    ];
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#3a3a55';
    for (var ai = 0; ai < axes.length; ai++) {
      var a = axes[ai];
      var p0 = project(rotatePoint(a.from[0], a.from[1], a.from[2]));
      var p1 = project(rotatePoint(a.to[0], a.to[1], a.to[2]));
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      // Label at positive end
      ctx.fillStyle = '#7a7a90';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(a.label, p1.x, p1.y - 8);
    }

    // Draw cube wireframe edges
    var cubeVerts = [];
    for (var xi = -1; xi <= 1; xi += 2)
      for (var yi = -1; yi <= 1; yi += 2)
        for (var zi = -1; zi <= 1; zi += 2)
          cubeVerts.push([xi, yi, zi]);
    var cubeEdges = [
      [0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]
    ];
    ctx.strokeStyle = '#25253a';
    ctx.lineWidth = 0.5;
    for (var ei = 0; ei < cubeEdges.length; ei++) {
      var e = cubeEdges[ei];
      var ep0 = project(rotatePoint(cubeVerts[e[0]][0], cubeVerts[e[0]][1], cubeVerts[e[0]][2]));
      var ep1 = project(rotatePoint(cubeVerts[e[1]][0], cubeVerts[e[1]][1], cubeVerts[e[1]][2]));
      ctx.beginPath();
      ctx.moveTo(ep0.x, ep0.y);
      ctx.lineTo(ep1.x, ep1.y);
      ctx.stroke();
    }

    // Sort points by z-depth (back to front)
    var projected = [];
    for (var i = 0; i < norm.length; i++) {
      var p3 = rotatePoint(norm[i].x, norm[i].y, norm[i].z);
      var p2 = project(p3);
      projected.push({idx: i, sx: p2.x, sy: p2.y, z: p3.z});
    }
    projected.sort(function(a, b) { return a.z - b.z; });

    // Draw points
    for (var pi = 0; pi < projected.length; pi++) {
      var pp = projected[pi];
      var pt = norm[pp.idx];
      var color = PCA_DOMAIN_COLORS[pt.domain] || '#888';
      var isMisaligned = misalignedSet[pt.concept] != null;
      var depthFade = 0.4 + 0.6 * ((pp.z + 1.2) / 2.4);
      var r = isMisaligned ? 6 : 4.5;
      r *= (0.8 + 0.4 * depthFade);

      ctx.beginPath();
      ctx.arc(pp.sx, pp.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = depthFade * (isMisaligned ? 1.0 : 0.75);
      ctx.fill();
      if (isMisaligned) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
    }

    // Store projected positions for hover
    window._pcaProjected = projected;
    window._pcaNorm = norm;
    window._pcaMisaligned = misalignedSet;
  }

  draw();

  // Named event handlers for cleanup
  function onMouseDown(e) {
    dragging = true;
    lastMX = e.clientX;
    lastMY = e.clientY;
    canvas.style.cursor = 'grabbing';
  }
  function onMouseMove(e) {
    if (dragging) {
      var dx = e.clientX - lastMX;
      var dy = e.clientY - lastMY;
      rotY += dx * 0.008;
      rotX += dy * 0.008;
      lastMX = e.clientX;
      lastMY = e.clientY;
      draw();
    }
  }
  function onMouseUp() {
    dragging = false;
    if (canvas) canvas.style.cursor = 'grab';
  }

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // Touch support
  function onTouchStart(e) {
    if (e.touches.length === 1) {
      dragging = true;
      lastMX = e.touches[0].clientX;
      lastMY = e.touches[0].clientY;
      e.preventDefault();
    }
  }
  function onTouchMove(e) {
    if (dragging && e.touches.length === 1) {
      var dx = e.touches[0].clientX - lastMX;
      var dy = e.touches[0].clientY - lastMY;
      rotY += dx * 0.008;
      rotX += dy * 0.008;
      lastMX = e.touches[0].clientX;
      lastMY = e.touches[0].clientY;
      draw();
      e.preventDefault();
    }
  }
  function onTouchEnd() { dragging = false; }
  canvas.addEventListener('touchstart', onTouchStart);
  canvas.addEventListener('touchmove', onTouchMove);
  canvas.addEventListener('touchend', onTouchEnd);

  // Hover tooltip
  canvas.addEventListener('mousemove', function(e) {
    if (dragging) return;
    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var mx = (e.clientX - rect.left) * scaleX;
    var my = (e.clientY - rect.top) * scaleX;
    var tooltip = document.getElementById('pca-tooltip');
    var best = null, bestDist = 20;
    var proj = window._pcaProjected || [];
    var nrm = window._pcaNorm || [];
    var mis = window._pcaMisaligned || {};
    // Search back-to-front (top-drawn last = closest)
    for (var i = proj.length - 1; i >= 0; i--) {
      var p = proj[i];
      var dx = mx - p.sx, dy = my - p.sy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) { best = p; bestDist = dist; break; }
    }
    if (best) {
      var pt = nrm[best.idx];
      var txt = pt.concept + ' (' + pt.domain + ')';
      if (mis[pt.concept]) txt += ' — clustered with ' + mis[pt.concept];
      tooltip.textContent = txt;
      tooltip.style.display = 'block';
      var tipX = (e.clientX - rect.left) + 12;
      var tipY = (e.clientY - rect.top) - 20;
      tooltip.style.left = tipX + 'px';
      tooltip.style.top = tipY + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  });
  canvas.addEventListener('mouseleave', function() {
    var tooltip = document.getElementById('pca-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  });

  // Register cleanup for listener removal on re-render
  window._pcaCleanup = function() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
}
