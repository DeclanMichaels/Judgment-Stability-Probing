/* runners.js - Experiment run execution and progress streaming. */

var activeRunIds = {};  // modelId -> run_id mapping for cancel

async function startRun() {
  var btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = 'Running...';

  var templateSelect = document.getElementById('template-select');
  var templates = templateSelect.value === 'all' ? null : [templateSelect.value];
  var iterations = parseInt(document.getElementById('iterations').value);
  var temperature = parseFloat(document.getElementById('temperature').value);

  var resume = document.getElementById('resume-check').checked;

  var log = document.getElementById('log');
  log.classList.remove('hidden');
  log.innerHTML = '';

  var runsArea = document.getElementById('runs-area');
  runsArea.classList.remove('hidden');
  runsArea.innerHTML = '';

  var models = Array.from(selectedModels);
  appendLog('Starting ' + selectedExperiment + ' on ' + models.length + ' model(s) in parallel...');

  var promises = models.map(function(modelId) {
    return runOneModel(modelId, templates, iterations, temperature, resume, runsArea);
  });
  var results = await Promise.allSettled(promises);

  var succeeded = results.filter(function(r) { return r.status === 'fulfilled' && r.value === true; }).length;
  var failed = models.length - succeeded;

  if (failed === 0) {
    appendLog('All ' + succeeded + ' runs completed successfully.', 'success');
  } else {
    appendLog(succeeded + ' succeeded, ' + failed + ' failed.', 'error');
  }

  btn.textContent = 'Run Experiment';
  btn.disabled = false;

  try {
    var reportsRes = await fetch(API + '/api/reports').then(function(r) { return r.json(); });
    renderResults(reportsRes.reports);
  } catch (e) {}
}

async function runOneModel(modelId, templates, iterations, temperature, resume, container) {
  var track = document.createElement('div');
  track.className = 'run-track';
  track.innerHTML =
    '<div class="run-track-header">' +
      '<span class="run-track-model">' + modelId + (resume ? ' <span style="color:var(--warning);font-size:0.7rem">(resume)</span>' : '') + '</span>' +
      '<span>' +
        '<span class="run-track-status running" id="status-' + CSS.escape(modelId) + '">starting</span>' +
        '<button class="cancel-btn" id="cancel-' + CSS.escape(modelId) + '" onclick="cancelRunForModel(\'' + modelId.replace(/'/g, "\\'") + '\')" style="display:none">Cancel</button>' +
      '</span>' +
    '</div>' +
    '<div class="run-track-bar">' +
      '<div class="run-track-fill" id="fill-' + CSS.escape(modelId) + '"></div>' +
    '</div>' +
    '<div class="run-track-text" id="text-' + CSS.escape(modelId) + '"></div>';
  container.appendChild(track);

  var esc = CSS.escape(modelId);

  try {
    var res = await fetch(API + '/api/runs', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        experiment: selectedExperiment,
        model_id: modelId,
        iterations: iterations,
        temperature: temperature,
        templates: templates,
        resume: resume,
      }),
    });

    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.detail || 'Failed to start');
    }

    var data = await res.json();
    var run_id = data.run_id;
    // Store run_id for cancel
    activeRunIds[modelId] = run_id;
    document.getElementById('cancel-' + esc).style.display = 'inline-block';
    appendLog('[' + modelId + '] Run started: ' + run_id + (resume ? ' (resume)' : ''));

    return new Promise(function(resolve) {
      var evtSource = new EventSource(API + '/api/runs/' + run_id + '/stream');
      evtSource.onmessage = function(event) {
        var d = JSON.parse(event.data);
        if (d.type === 'progress') {
          var pct = Math.round((d.current / d.total) * 100);
          document.getElementById('fill-' + esc).style.width = pct + '%';
          document.getElementById('text-' + esc).textContent =
            d.current + '/' + d.total + ' (' + pct + '%) ' + d.message;
          document.getElementById('status-' + esc).textContent = pct + '%';
        } else if (d.type === 'complete') {
          evtSource.close();
          var r = d.result;
          document.getElementById('fill-' + esc).style.width = '100%';
          document.getElementById('fill-' + esc).style.background = 'var(--success)';
          var statusEl = document.getElementById('status-' + esc);
          statusEl.textContent = 'done';
          statusEl.className = 'run-track-status completed';
          document.getElementById('cancel-' + esc).style.display = 'none';
          document.getElementById('text-' + esc).textContent =
            r.counts.actual_responses + '/' + r.counts.expected_responses + ' responses, ' + r.counts.parse_failures + ' parse failures';
          appendLog('[' + modelId + '] Completed: ' + r.counts.actual_responses + ' responses', 'success');
          resolve(true);
        } else if (d.type === 'cancelled') {
          evtSource.close();
          var statusEl = document.getElementById('status-' + esc);
          statusEl.textContent = 'cancelled';
          statusEl.className = 'run-track-status cancelled';
          document.getElementById('cancel-' + esc).style.display = 'none';
          document.getElementById('text-' + esc).textContent = 'Cancelled by user';
          appendLog('[' + modelId + '] Cancelled', 'error');
          resolve(false);
        } else if (d.type === 'error') {
          evtSource.close();
          var statusEl = document.getElementById('status-' + esc);
          statusEl.textContent = 'failed';
          statusEl.className = 'run-track-status failed';
          document.getElementById('cancel-' + esc).style.display = 'none';
          document.getElementById('text-' + esc).textContent = d.error;
          appendLog('[' + modelId + '] Error: ' + d.error, 'error');
          resolve(false);
        }
      };
      evtSource.onerror = function() {
        evtSource.close();
        var statusEl = document.getElementById('status-' + esc);
        statusEl.textContent = 'lost';
        statusEl.className = 'run-track-status failed';
        appendLog('[' + modelId + '] Connection lost', 'error');
        resolve(false);
      };
    });

  } catch (e) {
    document.getElementById('status-' + esc).textContent = 'failed';
    document.getElementById('status-' + esc).className = 'run-track-status failed';
    document.getElementById('text-' + esc).textContent = e.message;
    appendLog('[' + modelId + '] Error: ' + e.message, 'error');
    return false;
  }
}

async function cancelRunForModel(modelId) {
  var esc = CSS.escape(modelId);
  var cancelBtn = document.getElementById('cancel-' + esc);
  var runId = activeRunIds[modelId];
  if (!runId) return;

  cancelBtn.disabled = true;
  cancelBtn.textContent = 'Cancelling...';

  try {
    var res = await fetch(API + '/api/runs/' + runId + '/cancel', {
      method: 'POST',
    });
    if (!res.ok) {
      appendLog('Failed to cancel run ' + runId, 'error');
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel';
    }
  } catch (e) {
    appendLog('Failed to cancel: ' + e.message, 'error');
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel';
  }
}
