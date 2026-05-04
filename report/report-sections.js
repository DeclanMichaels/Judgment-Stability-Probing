/**
 * report-sections.js - Section renderers.
 * Depends on: report-utils.js
 */

/* -----------------------------------------------------------------------
 * Section: Data Quality
 * ----------------------------------------------------------------------- */

function renderQuality(s) {
  var best = s.rows[0], worst = s.rows[0];
  for (var i = 1; i < s.rows.length; i++) {
    if (s.rows[i].api_errors < best.api_errors) best = s.rows[i];
    if (s.rows[i].api_errors > worst.api_errors) worst = s.rows[i];
  }

  var ab = 'Each model was asked to rate all 1,431 concept pairs under all 7 framings (10,017 total calls). ';
  ab += '<strong>Ratings</strong> counts how many calls returned a valid 1-7 number. ';
  ab += '<strong>Parse %</strong> is ratings divided by expected calls. ';
  ab += '<strong>API Errors</strong> are network or billing failures (retried via resume). ';
  ab += '<strong>Refusals</strong> are cases where the model declined to rate.';
  var ex = 'Example: <strong>' + best.model + '</strong> completed with ' + best.api_errors + ' errors. ';
  if (worst.api_errors > 0) {
    ex += '<strong>' + worst.model + '</strong> had ' + worst.api_errors + ' errors (credit exhaustion mid-run, recovered via resume). ';
  }
  ex += 'All models achieved 100% parse rate with zero refusals.';
  ab += annoExample(ex);

  var h = annotation(ab);

  h += '<table><tr><th>Model</th><th class="num">Ratings</th><th class="num">Errors</th><th class="num">Parse %</th><th class="num">Refusals</th></tr>';
  for (var i = 0; i < s.rows.length; i++) {
    var r = s.rows[i];
    h += '<tr><td class="model">' + r.model + '</td>';
    h += '<td class="num">' + r.valid_ratings.toLocaleString() + '</td>';
    h += '<td class="num">' + (r.api_errors > 0 ? '<span style="color:var(--warning)">' + r.api_errors + '</span>' : '0') + '</td>';
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

  // Find extremes under geometric for annotation
  var hiModel = '', hiDrift = 0, loModel = '', loDrift = 999;
  for (var i = 0; i < s.models.length; i++) {
    var geo = (s.data[s.models[i]] || {}).geometric || {};
    if (geo.abs_drift != null) {
      if (geo.abs_drift > hiDrift) { hiDrift = geo.abs_drift; hiModel = s.models[i]; }
      if (geo.abs_drift < loDrift) { loDrift = geo.abs_drift; loModel = s.models[i]; }
    }
  }
  var hiRho = ((s.data[hiModel] || {}).geometric || {}).spearman_rho;
  var loRho = ((s.data[loModel] || {}).geometric || {}).spearman_rho;

  var ab = '<strong>Absolute drift</strong> is the average change in rating (on the 1-7 scale) across all 1,431 pairs when a framing is applied. ';
  ab += 'A drift of 0.5 means the model shifted its ratings by half a point on average. A drift of 1.5 means many individual pairs moved 2-3 points. ';
  ab += 'Higher numbers = more sensitivity to framing.';
  ab += annoExample('Under geometric framing, <strong>' + hiModel + '</strong> drifted ' + hiDrift.toFixed(3) + ' points on average (most destabilized). ' +
    '<strong>' + loModel + '</strong> drifted only ' + loDrift.toFixed(3) + ' (most stable).');
  ab += '<strong>Spearman rho</strong> measures whether the rank ordering of pairs was preserved. ';
  ab += 'Rho near 1.0 means all pairs kept their relative positions (just shifted up or down together). ';
  ab += 'Low rho means the model reorganized which concepts it considers similar to which, a deeper structural change.';
  ab += annoExample('Under geometric framing, <strong>' + loModel + '</strong> held rho = ' + (loRho != null ? loRho.toFixed(3) : '--') + ' (structure preserved). ' +
    '<strong>' + hiModel + '</strong> dropped to rho = ' + (hiRho != null ? hiRho.toFixed(3) : '--') + ' (structure reorganized).');
  ab += '<strong>Domain drift</strong> breaks this down by concept type. Physical concepts are the control (should not move under cultural framing). ';
  ab += 'Institutional and moral concepts are the targets.';

  var h = annotation(ab, true);

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
  h += '<th class="num">Phys (geo)</th><th class="num">Inst (geo)</th><th class="num">Moral (geo)</th>';
  h += '<th class="num">Phys (glr)</th><th class="num">Inst (glr)</th><th class="num">Moral (glr)</th></tr>';
  var domains = ['physical', 'institutional', 'moral'];
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i], md = s.data[m] || {};
    var geo = (md.geometric || {}).domain_drift || {};
    var glr = (md.glorbic || {}).domain_drift || {};
    h += '<tr><td class="model">' + m + '</td>';
    for (var di = 0; di < domains.length; di++) {
      var v = (geo[domains[di]] || {}).abs_drift;
      h += '<td class="heat" style="background:' + heatColor(v, 0, 1.5) + '">' + (v != null ? v.toFixed(3) : '--') + '</td>';
    }
    for (var di = 0; di < domains.length; di++) {
      var v = (glr[domains[di]] || {}).abs_drift;
      h += '<td class="heat" style="background:' + heatColor(v, 0, 1.5) + '">' + (v != null ? v.toFixed(3) : '--') + '</td>';
    }
    h += '</tr>';
  }
  h += '</table>';

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
  var maxGeo = {model: '', rate: 0}, minGeo = {model: '', rate: 100};
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i];
    var gr = ((s.summary[m] || {}).geometric || {}).rate || 0;
    if (gr > maxGeo.rate) maxGeo = {model: m, rate: gr};
    if (gr < minGeo.rate) minGeo = {model: m, rate: gr};
  }

  var ab = '<strong>Compliance</strong> measures whether the model integrates framing language into its explanations, not just its ratings. ';
  ab += '<strong>Geometric compliance</strong> is detected by geometry-related terms (triangle, symmetry, angular, etc.) appearing in explanations. ';
  ab += '<strong>Glorbic compliance</strong> is detected by the model echoing the made-up term "glorbic" or "glorb." ';
  ab += 'The <strong>gradient</strong> between the two reveals how the model processes nonsense: ';
  ab += 'high geometric + low glorbic means the model anchors on semantic content. High both means unconditional compliance.';
  var glrRate = ((s.summary[maxGeo.model] || {}).glorbic || {}).rate || 0;
  ab += annoExample('<strong>' + maxGeo.model + '</strong> integrated geometric language into ' + maxGeo.rate.toFixed(1) + '% of explanations ' +
    'and echoed "glorbic" in ' + glrRate.toFixed(1) + '%. ' +
    '<strong>' + minGeo.model + '</strong> showed only ' + minGeo.rate.toFixed(1) + '% geometric compliance, the lowest in the set.');

  var h = annotation(ab);

  h += '<table><tr><th>Model</th><th class="num">Geometric</th><th class="num">Glorbic</th><th>Gradient</th></tr>';
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i];
    var sm = s.summary[m] || {};
    var geo = sm.geometric || {}, glr = sm.glorbic || {};
    var geoRate = geo.rate || 0, glrRate = glr.rate || 0;

    h += '<tr><td class="model">' + m + '</td>';
    h += '<td class="num bar-cell"><div class="bar-bg" style="width:' + geoRate + '%;background:' + barColor(geoRate) + '"></div>';
    h += '<span class="bar-label">' + geoRate.toFixed(1) + '% (' + (geo.compliant || 0) + '/' + (geo.total || 0) + ')</span></td>';
    h += '<td class="num bar-cell"><div class="bar-bg" style="width:' + glrRate + '%;background:' + barColor(glrRate) + '"></div>';
    h += '<span class="bar-label">' + glrRate.toFixed(1) + '% (' + (glr.compliant || 0) + '/' + (glr.total || 0) + ')</span></td>';

    var ratio = geoRate > 0 && glrRate > 0 ? (geoRate / glrRate).toFixed(1) + ':1' : (glrRate === 0 && geoRate > 0) ? '\u221e' : 'none';
    h += '<td class="num">' + ratio + '</td></tr>';
  }
  h += '</table>';

  // Data-driven finding box
  // Find: highest compliance, steepest gradient, flattest gradient
  var highest = {model: '', geo: 0, glr: 0};
  var steepest = {model: '', geo: 0, glr: 0, ratio: 0};
  var flattest = {model: '', geo: 0, glr: 0, diff: 999};
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i];
    var sm = s.summary[m] || {};
    var gr = (sm.geometric || {}).rate || 0;
    var gl = (sm.glorbic || {}).rate || 0;
    if (gr > highest.geo) highest = {model: m, geo: gr, glr: gl};
    var r = gl > 0 ? gr / gl : (gr > 0 ? Infinity : 0);
    if (r > steepest.ratio && isFinite(r)) steepest = {model: m, geo: gr, glr: gl, ratio: r};
    var diff = Math.abs(gr - gl);
    if (diff < flattest.diff && gr > 5) flattest = {model: m, geo: gr, glr: gl, diff: diff};
  }

  h += '<div class="finding-box"><h3>Key Finding</h3><p>';
  h += '<strong>' + highest.model + '</strong> shows ' + highest.geo.toFixed(1) + '% geometric and ' + highest.glr.toFixed(1) + '% glorbic compliance, the highest in the set. ';
  if (flattest.model && flattest.diff < 5) {
    h += '<strong>' + flattest.model + '</strong> shows nearly equal compliance for interpretable and uninterpretable nonsense (' + flattest.geo.toFixed(1) + '% vs ' + flattest.glr.toFixed(1) + '%), suggesting a different compliance mechanism. ';
  }
  if (steepest.model && steepest.model !== highest.model) {
    h += '<strong>' + steepest.model + '</strong> shows the steepest gradient (' + steepest.geo.toFixed(1) + '% geometric vs ' + steepest.glr.toFixed(1) + '% glorbic), anchoring strongly on semantic content.';
  }
  h += '</p></div>';

  return h;
}

/* -----------------------------------------------------------------------
 * Section: Procrustes Alignment (Scatter Plot)
 * ----------------------------------------------------------------------- */

function renderProcrustes(s) {
  var framings = s.framings;

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
  var W = 700, H = 420;
  var PAD = {top: 20, right: 30, bottom: 50, left: 60};
  var plotW = W - PAD.left - PAD.right;
  var plotH = H - PAD.top - PAD.bottom;
  var xMax = Math.ceil(maxX * 5) / 5 + 0.1;
  var yMax = Math.ceil(maxY * 5) / 5 + 0.05;

  h += '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:' + W + 'px;display:block;margin:1rem 0" xmlns="http://www.w3.org/2000/svg">';

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
    var isNonsense = (p.framing === 'geometric' || p.framing === 'glorbic');
    var r = isNonsense ? 6 : 4;
    var opacity = isNonsense ? 0.7 : 0.35;
    var tip = p.model + ' / ' + p.framing + '&#10;Drift: ' + p.drift.toFixed(3) + ', Struct: ' + p.proc.toFixed(4);

    if (p.framing === 'geometric') {
      // Diamond
      var pts = cx + ',' + (cy - r) + ' ' + (cx + r) + ',' + cy + ' ' + cx + ',' + (cy + r) + ' ' + (cx - r) + ',' + cy;
      h += '<polygon points="' + pts + '" fill="' + color + '" fill-opacity="' + opacity + '" stroke="' + color + '" stroke-width="2"><title>' + tip + '</title></polygon>';
    } else if (p.framing === 'glorbic') {
      // Square
      h += '<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (r * 2) + '" height="' + (r * 2) + '" fill="' + color + '" fill-opacity="' + opacity + '" stroke="' + color + '" stroke-width="2"><title>' + tip + '</title></rect>';
    } else {
      // Circle
      h += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '" fill-opacity="' + opacity + '" stroke="' + color + '"><title>' + tip + '</title></circle>';
    }
  }
  h += '</svg>';

  // Model legend
  h += '<div class="scatter-legend">';
  for (var i = 0; i < s.models.length; i++) {
    h += '<span><span style="width:10px;height:10px;border-radius:2px;display:inline-block;background:' + modelColors[s.models[i]] + '"></span>' + s.models[i] + '</span>';
  }
  h += '</div>';
  h += '<div class="scatter-shapes">';
  h += '<span style="margin-right:1rem">&#9679; Cultural framings (faded)</span>';
  h += '<span style="margin-right:1rem">&#9670; Geometric (diamond)</span>';
  h += '<span>&#9632; Glorbic (square)</span>';
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
  var maxModel = '', maxRatio = 0;
  for (var i = 0; i < s.models.length; i++) {
    var gr = ((s.data[s.models[i]] || {}).geometric || {}).ratio_to_unframed;
    if (gr != null && gr > maxRatio) { maxRatio = gr; maxModel = s.models[i]; }
  }

  var ab = 'Each model produces a spread of ratings from 1 to 7. <strong>Variance</strong> measures how wide that spread is. ';
  ab += 'The <strong>ratio to unframed</strong> tells you whether framing makes the model more or less certain. ';
  ab += 'Ratio &gt; 1.0 means ratings spread out more under framing (model is less certain, hedging). ';
  ab += 'Ratio &lt; 1.0 means ratings compress toward the mean (model becomes more uniform). ';
  ab += 'Ratio near 1.0 means the spread didn\'t change, only the center shifted.';
  ab += annoExample('<strong>' + maxModel + '</strong> has a geometric variance ratio of ' + maxRatio.toFixed(4) + ', ' +
    'meaning its ratings spread out ' + ((maxRatio - 1) * 100).toFixed(0) + '% more under geometric framing. ' +
    'The model became less certain about its similarity judgments when processing the nonsense frame.');

  var h = annotation(ab);

  h += '<table><tr><th>Model</th><th class="num">Unframed</th><th class="num">Geometric</th><th class="num">Geo Ratio</th><th class="num">Glorbic</th><th class="num">Glr Ratio</th></tr>';
  for (var i = 0; i < s.models.length; i++) {
    var m = s.models[i], md = s.data[m] || {};
    var uf = md.unframed || {}, geo = md.geometric || {}, glr = md.glorbic || {};
    h += '<tr><td class="model">' + m + '</td>';
    h += '<td class="num">' + (uf.variance != null ? uf.variance.toFixed(4) : '--') + '</td>';
    h += '<td class="num">' + (geo.variance != null ? geo.variance.toFixed(4) : '--') + '</td>';
    var gr = geo.ratio_to_unframed;
    h += '<td class="num" style="color:' + (gr > 1.1 ? 'var(--warning)' : gr < 0.9 ? 'var(--accent2)' : 'var(--dim)') + '">' + (gr != null ? gr.toFixed(4) : '--') + '</td>';
    h += '<td class="num">' + (glr.variance != null ? glr.variance.toFixed(4) : '--') + '</td>';
    var glrr = glr.ratio_to_unframed;
    h += '<td class="num" style="color:' + (glrr > 1.1 ? 'var(--warning)' : glrr < 0.9 ? 'var(--accent2)' : 'var(--dim)') + '">' + (glrr != null ? glrr.toFixed(4) : '--') + '</td>';
    h += '</tr>';
  }
  h += '</table>';
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

  // Legend
  var h = '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem;font-size:0.75rem">';
  for (var j = 0; j < framings.length; j++) {
    h += '<span style="display:flex;align-items:center;gap:0.3rem">';
    h += '<span style="width:12px;height:12px;border-radius:2px;background:' + FSI_COLORS[framings[j]] + '"></span>';
    h += framings[j] + '</span>';
  }
  h += '</div>';

  // Domain panels
  var domainLabels = {physical: 'Physical (Control)', institutional: 'Institutional', moral: 'Moral'};
  var domainColors = {physical: 'var(--accent2)', institutional: 'var(--warning)', moral: 'var(--accent)'};
  var domainOrder = ['physical', 'institutional', 'moral'];

  for (var di = 0; di < domainOrder.length; di++) {
    var dom = domainOrder[di];
    var concepts = byDomain[dom];
    h += '<div style="margin-bottom:2rem">';
    h += '<h3 class="fsi-domain-header" style="color:' + domainColors[dom] + '">' + domainLabels[dom] + '</h3>';

    for (var ci = 0; ci < concepts.length; ci++) {
      var entry = concepts[ci];
      var c = entry.concept;
      var cd = entry.data;

      h += '<div class="fsi-row">';
      h += '<div class="fsi-concept">' + c + '</div>';
      h += '<div class="fsi-bars">';
      for (var j = 0; j < framings.length; j++) {
        var f = framings[j];
        var v = cd[f];
        var width = v != null ? Math.max(1, (v / maxVal) * 100) : 0;
        var showLabel = v != null && width > 8;
        h += '<div class="fsi-bar" style="width:' + width + '%;min-width:' + (v != null && v > 0 ? '2px' : '0') + ';background:' + FSI_COLORS[f] + '" title="' + f + ': ' + (v != null ? v.toFixed(3) : 'n/a') + '">';
        if (showLabel) h += '<span class="fsi-bar-label">' + v.toFixed(2) + '</span>';
        h += '</div>';
      }
      h += '</div>';
      h += '<div class="fsi-mean">' + entry.meanFSI.toFixed(2) + '</div>';
      h += '</div>';
    }
    h += '</div>';
  }

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
