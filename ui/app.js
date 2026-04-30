/* app.js - Initialization, panel rendering, and selection controls.
 *
 * Setup flow and model management live in setup.js.
 * Run execution and progress streaming live in runners.js.
 */

var API = '';

var selectedModels = new Set();
var selectedExperiment = null;
var experimentConfigs = {};

// Shared state — written here during init, read by setup.js
var vendorSetupStatus = {};
var standaloneConfig = null;

async function init() {
  try {
    var results = await Promise.all([
      fetch(API + '/api/setup/status').then(function(r) { return r.json(); }),
      fetch(API + '/api/standalone').then(function(r) { return r.json(); }),
    ]);
    var setupRes = results[0];
    standaloneConfig = results[1].standalone;
    vendorSetupStatus = setupRes.vendors;

    // Apply standalone theming
    if (standaloneConfig) {
      if (standaloneConfig.accent) {
        document.documentElement.style.setProperty('--accent', standaloneConfig.accent);
      }
      document.title = standaloneConfig.title || 'Experiment Platform';
    }

    if (!setupRes.any_configured) {
      showSetup(false);
      return;
    }
  } catch (e) {
    document.getElementById('setup-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    document.getElementById('models-list').textContent = 'Failed to connect to server';
    document.getElementById('experiments-list').textContent = 'Start server with: ./start.sh';
    document.getElementById('results-list').textContent = '';
    return;
  }

  showMainView();
}

async function showMainView() {
  document.getElementById('setup-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');

  // Set heading
  var heading = document.querySelector('.main-header h1');
  if (heading) {
    heading.textContent = (standaloneConfig && standaloneConfig.title) || 'Experiment Platform';
  }

  try {
    var results = await Promise.all([
      fetch(API + '/api/models').then(function(r) { return r.json(); }),
      fetch(API + '/api/experiments').then(function(r) { return r.json(); }),
      fetch(API + '/api/reports').then(function(r) { return r.json(); }),
    ]);
    renderModels(results[0].vendors);
    renderExperiments(results[1].experiments);
    renderResults(results[2].reports);

    // Standalone: auto-select the experiment
    if (standaloneConfig && standaloneConfig.experiment) {
      var expOpts = document.querySelectorAll('.exp-option');
      for (var i = 0; i < expOpts.length; i++) {
        if (expOpts[i].dataset.name === standaloneConfig.experiment) {
          var exp = experimentConfigs[standaloneConfig.experiment];
          if (exp) selectExperiment(expOpts[i], exp);
          break;
        }
      }
    }
  } catch (e) {
    document.getElementById('models-list').textContent = 'Error loading data';
  }
}


// ---------------------------------------------------------------------------
// Models Panel
// ---------------------------------------------------------------------------

function renderModels(vendors) {
  var container = document.getElementById('models-list');
  container.innerHTML = '';
  for (var vendor in vendors) {
    var group = document.createElement('div');
    group.className = 'vendor-group';
    group.innerHTML = '<div class="vendor-name">' + vendor + '</div>';
    var models = vendors[vendor];
    for (var i = 0; i < models.length; i++) {
      var opt = document.createElement('div');
      opt.className = 'model-option';
      opt.dataset.id = models[i].id;
      opt.dataset.vendor = vendor;

      var label = document.createElement('span');
      label.textContent = models[i].label;
      label.onclick = (function(el, id) {
        return function() { toggleModel(el.parentNode, id); };
      })(label, models[i].id);
      opt.appendChild(label);

      var del = document.createElement('button');
      del.className = 'model-delete-btn';
      del.textContent = '\u00d7';
      del.title = 'Remove ' + models[i].label;
      del.onclick = (function(v, id, lbl) {
        return function(e) {
          e.stopPropagation();
          deleteModel(v, id, lbl);
        };
      })(vendor, models[i].id, models[i].label);
      opt.appendChild(del);

      group.appendChild(opt);
    }
    container.appendChild(group);
  }

  var addBtn = document.createElement('button');
  addBtn.className = 'add-model-btn';
  addBtn.textContent = '+ Add Model';
  addBtn.onclick = showAddModelDialog;
  container.appendChild(addBtn);
}


// ---------------------------------------------------------------------------
// Experiments Panel
// ---------------------------------------------------------------------------

function renderExperiments(experiments) {
  var container = document.getElementById('experiments-list');
  container.innerHTML = '';
  for (var i = 0; i < experiments.length; i++) {
    var exp = experiments[i];
    experimentConfigs[exp.name] = exp;
    var opt = document.createElement('div');
    opt.className = 'exp-option';
    opt.innerHTML =
      '<strong>' + exp.name + '</strong> ' +
      '<span style="color:var(--text-dim)">v' + exp.version +
      ' (' + exp.stimuli_count + ' stimuli)</span>';
    opt.dataset.name = exp.name;
    opt.onclick = (function(el, e) {
      return function() { selectExperiment(el, e); };
    })(opt, exp);
    container.appendChild(opt);
  }
}


// ---------------------------------------------------------------------------
// Results Panel
// ---------------------------------------------------------------------------

function renderResults(reports) {
  var container = document.getElementById('results-list');
  if (!reports || reports.length === 0) {
    container.innerHTML = '<div class="no-results">No results yet. Run an experiment to see results here.</div>';
    return;
  }
  container.innerHTML = '';
  for (var i = 0; i < reports.length; i++) {
    var report = reports[i];
    var card = document.createElement('div');
    card.className = 'report-card';
    var html = '<div class="report-card-name">' + report.experiment + '</div>';
    if (report.has_report) {
      html += '<a class="report-link" href="' + report.report_url + '" target="_blank" title="Open report in new tab">View Report</a>';
      var today = new Date().toISOString().slice(0, 10);
      var saveFilename = report.experiment + '-' + today + '.html';
      html += '<a class="report-link" href="' + report.report_url + '" download="' + saveFilename + '" title="Download as standalone HTML file">Save Report</a>';
    }
    if (report.has_scorer) {
      html += '<a class="report-link" href="' + report.scorer_url + '" target="_blank" title="Open manual scoring interface">Scorer</a>';
    }
    // Analyze button (show if experiment has runs)
    if (report.runs.length > 0 && report.has_build_report) {
      var btnLabel = report.has_report ? 'Rebuild Analysis' : 'Analyze';
      var btnTitle = report.has_report ? 'Re-run scoring and regenerate report' : 'Score responses and generate report';
      html += '<button class="analyze-btn" id="analyze-btn-' + report.experiment + '" ' +
        'title="' + btnTitle + '" ' +
        'onclick="startAnalysis(\'' + report.experiment + '\')">' + btnLabel + '</button> ';
    }
    // Analysis progress area
    html += '<div class="analyze-progress hidden" id="analyze-progress-' + report.experiment + '"></div>';
    for (var j = 0; j < report.runs.length; j++) {
      var run = report.runs[j];
      var shortModel = run.model.split('/').pop();
      var date = run.completed ? new Date(run.completed).toLocaleDateString() : '';

      // Unresolved = missing + unparseable
      var missing = (run.expected && run.expected !== 'in_progress')
        ? Math.max(0, run.expected - run.responses) : 0;
      var unresolved = missing + (run.parse_failures || 0);
      var status = '';
      if (unresolved > 0) {
        status = ' <span class="run-errors">' + unresolved + ' unresolved</span>';
      }

      var tempLabel = run.temperature != null ? 't=' + run.temperature : '';
      var itersLabel = run.iterations > 1 ? run.iterations + ' iters' : '';
      var params = [tempLabel, itersLabel].filter(Boolean).join(', ');
      if (params) params = ' [' + params + ']';

      html +=
        '<div class="run-summary">' +
          '<span class="run-model">' + shortModel + '</span> ' +
          run.responses + '/' + (run.expected || '?') + ' responses, ' +
          run.templates + ' templates' + params + ' ' + date + status +
          ' <button class="run-delete-btn" onclick="deleteRun(\'' + report.experiment + '\', \'' +
          run.run_dir.replace(/'/g, "\\'") + '\')" title="Delete this run">&times;</button>' +
        '</div>';
    }
    card.innerHTML = html;
    container.appendChild(card);
  }
}


// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

async function startAnalysis(experiment) {
  var btn = document.getElementById('analyze-btn-' + experiment);
  var progress = document.getElementById('analyze-progress-' + experiment);
  if (!btn || !progress) return;

  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  progress.classList.remove('hidden');
  progress.innerHTML = '<div class="analyze-log"></div>';

  var logEl = progress.querySelector('.analyze-log');

  try {
    var res = await fetch(API + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ experiment: experiment }),
    });

    if (!res.ok) {
      // Non-streaming error (validation failure)
      var err = await res.json();
      logEl.innerHTML = '<span style="color:var(--accent)">' + (err.detail || 'Analysis failed') + '</span>';
      btn.disabled = false;
      btn.textContent = 'Analyze';
      return;
    }

    // Read SSE stream
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';

    while (true) {
      var result = await reader.read();
      if (result.done) break;

      buffer += decoder.decode(result.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line.startsWith('data: ')) continue;
        var event;
        try { event = JSON.parse(line.substring(6)); } catch (e) { continue; }

        if (event.type === 'progress') {
          var entry = document.createElement('div');
          entry.className = 'analyze-log-entry';
          entry.textContent = event.message;
          logEl.appendChild(entry);
          logEl.scrollTop = logEl.scrollHeight;
        } else if (event.type === 'complete') {
          var entry = document.createElement('div');
          entry.className = 'analyze-log-entry success';
          entry.textContent = event.message;
          logEl.appendChild(entry);

          // Refresh results panel to show new report link
          var reportsRes = await fetch(API + '/api/reports').then(function(r) { return r.json(); });
          renderResults(reportsRes.reports);
          return;
        } else if (event.type === 'error') {
          var entry = document.createElement('div');
          entry.className = 'analyze-log-entry error';
          entry.textContent = event.message;
          logEl.appendChild(entry);
        }
      }
    }
  } catch (e) {
    logEl.innerHTML += '<div class="analyze-log-entry error">Connection lost: ' + e.message + '</div>';
  }

  btn.disabled = false;
  btn.textContent = 'Analyze';
}


// ---------------------------------------------------------------------------
// Selection & Controls
// ---------------------------------------------------------------------------

function toggleModel(el, modelId) {
  if (selectedModels.has(modelId)) {
    selectedModels.delete(modelId);
    el.classList.remove('selected');
  } else {
    selectedModels.add(modelId);
    el.classList.add('selected');
  }
  updateRunButton();
  updateCallCount();
}

function selectExperiment(el, exp) {
  var opts = document.querySelectorAll('.exp-option');
  for (var i = 0; i < opts.length; i++) opts[i].classList.remove('selected');
  el.classList.add('selected');
  selectedExperiment = exp.name;

  var select = document.getElementById('template-select');
  select.innerHTML = '<option value="all">All</option>';
  for (var i = 0; i < exp.templates.length; i++) {
    select.innerHTML += '<option value="' + exp.templates[i] + '">' + exp.templates[i] + '</option>';
  }

  document.getElementById('iterations').value = exp.parameters.iterations != null ? exp.parameters.iterations : 1;
  document.getElementById('temperature').value = exp.parameters.temperature != null ? exp.parameters.temperature : 0.7;

  updateRunButton();
  updateCallCount();
}

function updateRunButton() {
  document.getElementById('run-btn').disabled =
    !(selectedModels.size > 0 && selectedExperiment);
}

function updateCallCount() {
  var el = document.getElementById('call-count');
  if (!selectedExperiment || !experimentConfigs[selectedExperiment] || selectedModels.size === 0) {
    el.classList.add('hidden');
    return;
  }

  var exp = experimentConfigs[selectedExperiment];
  var iterations = parseInt(document.getElementById('iterations').value) || 1;
  var templateSelect = document.getElementById('template-select');
  var templateCount = templateSelect.value === 'all' ? exp.templates.length : 1;
  var perModel = exp.stimuli_count * templateCount * iterations;
  var total = perModel * selectedModels.size;

  var html = total.toLocaleString() + ' API calls';
  if (selectedModels.size > 1) {
    html +=
      '<span class="detail">' + perModel.toLocaleString() +
      ' per model x ' + selectedModels.size + ' models (parallel)</span>';
  }
  el.innerHTML = html;
  el.classList.remove('hidden');
}


// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

function appendLog(text, cls) {
  cls = cls || '';
  var log = document.getElementById('log');
  var entry = document.createElement('div');
  entry.className = 'entry ' + cls;
  entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}


async function deleteRun(experiment, runDir) {
  if (!confirm('Delete this run? This cannot be undone.')) return;
  try {
    var res = await fetch(API + '/api/runs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_dir: runDir }),
    });
    if (!res.ok) {
      var err = await res.json();
      alert('Delete failed: ' + (err.detail || 'Unknown error'));
      return;
    }
    var reportsRes = await fetch(API + '/api/reports').then(function(r) { return r.json(); });
    renderResults(reportsRes.reports);
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}


async function deleteModel(vendor, modelId, label) {
  if (!confirm('Remove ' + label + ' from ' + vendor + '?')) return;
  try {
    var res = await fetch(API + '/api/models/' + encodeURIComponent(vendor) + '/' + modelId.split('/').map(encodeURIComponent).join('/'), {
      method: 'DELETE',
    });
    if (!res.ok) {
      var err = await res.json();
      alert('Delete failed: ' + (err.detail || 'Unknown error'));
      return;
    }
    selectedModels.delete(modelId);
    var modelsRes = await fetch(API + '/api/models').then(function(r) { return r.json(); });
    renderModels(modelsRes.vendors);
    updateRunButton();
    updateCallCount();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}
