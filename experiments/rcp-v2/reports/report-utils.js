/**
 * report-utils.js - Shared utilities, constants, and helpers.
 * No dependencies.
 */

/* -----------------------------------------------------------------------
 * Color utilities
 * ----------------------------------------------------------------------- */

var HEAT_COLORS = {
  low:  [48, 96, 160],   // cold blue
  mid:  [30, 30, 40],    // dark neutral
  high: [224, 80, 80]    // hot red
};

/**
 * Map a value to a blue-neutral-red gradient.
 * Returns an rgb() string.
 */
function heatColor(value, min, max) {
  if (value == null) return 'transparent';
  var t = max > min ? (value - min) / (max - min) : 0;
  t = Math.max(0, Math.min(1, t));
  var from, to, s;
  if (t < 0.5) {
    from = HEAT_COLORS.low; to = HEAT_COLORS.mid; s = t / 0.5;
  } else {
    from = HEAT_COLORS.mid; to = HEAT_COLORS.high; s = (t - 0.5) / 0.5;
  }
  var r = Math.round(from[0] + (to[0] - from[0]) * s);
  var g = Math.round(from[1] + (to[1] - from[1]) * s);
  var b = Math.round(from[2] + (to[2] - from[2]) * s);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/** Pick a bar color based on percentage. */
function barColor(pct) {
  if (pct > 50) return 'var(--hot)';
  if (pct > 20) return 'var(--warning)';
  return 'var(--accent2)';
}

/** Collect all values of a nested field for computing scale bounds. */
function collectValues(data, models, framings, field) {
  var vals = [];
  for (var i = 0; i < models.length; i++) {
    var md = data[models[i]] || {};
    for (var j = 0; j < framings.length; j++) {
      var v = (md[framings[j]] || {})[field];
      if (v != null) vals.push(v);
    }
  }
  return vals;
}

/* -----------------------------------------------------------------------
 * Constants
 * ----------------------------------------------------------------------- */

var FSI_COLORS = {
  individualist: '#5090d0',
  collectivist:  '#d07050',
  hierarchical:  '#d0a040',
  egalitarian:   '#50b080',
  geometric:     '#c050c0',
  glorbic:       '#e05070',
  nonsense:      '#c050c0',
  irrelevant:    '#8080a0',
  landlocked:    '#60a0a0'
};

var _FRAMING_COLOR_POOL = [
  '#c050c0', '#e05070', '#8080a0', '#60a0a0', '#b08040', '#40a0d0'
];
var _framingColorIdx = 0;

/** Get a color for any framing name. Known framings use fixed colors, unknown get pool colors. */
function framingColor(name) {
  if (FSI_COLORS[name]) return FSI_COLORS[name];
  FSI_COLORS[name] = _FRAMING_COLOR_POOL[_framingColorIdx % _FRAMING_COLOR_POOL.length];
  _framingColorIdx++;
  return FSI_COLORS[name];
}

/** Get nonsense framings from the loaded report, or fall back to known defaults. */
function getNonsenseFramings() {
  if (window._report && window._report.nonsense_framings) return window._report.nonsense_framings;
  // Legacy fallback: guess from framings list
  var all = (window._report && window._report.framings) || [];
  var cultural = ['unframed', 'individualist', 'collectivist', 'hierarchical', 'egalitarian'];
  return all.filter(function(f) { return cultural.indexOf(f) === -1; });
}

var MODEL_PALETTE = [
  '#5090d0', '#e05070', '#50b080', '#d0a040',
  '#c050c0', '#e08040', '#40c0c0', '#a0a060'
];

/* -----------------------------------------------------------------------
 * Annotation helper
 * ----------------------------------------------------------------------- */

/**
 * Build a collapsible "How to read this" annotation.
 * @param {string} body - HTML content
 * @param {boolean} open - start expanded?
 */
function annotation(body, open) {
  return '<details class="annotation"' + (open ? ' open' : '') + '>' +
    '<summary>How to read this</summary>' +
    '<div class="anno-body">' + body + '</div></details>';
}

function annoExample(html) {
  return '<div class="anno-example">' + html + '</div>';
}
