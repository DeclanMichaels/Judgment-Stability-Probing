/* setup.js - API key configuration and model management.
 *
 * Depends on globals from app.js: API, vendorSetupStatus, showMainView, renderModels.
 *
 * Handles:
 *   - First-run setup (no .env or no keys configured)
 *   - Settings revisit (gear button from main UI)
 *   - Add Model dialog (test call + save to vendor config)
 */

var MASKED_KEY = '********';


// ---------------------------------------------------------------------------
// Setup Page — first run and settings revisit
// ---------------------------------------------------------------------------

/**
 * Show the setup/settings page.
 * @param {boolean} canGoBack - true if returning from main UI (show back button)
 */
function showSetup(canGoBack) {
  document.getElementById('setup-view').classList.remove('hidden');
  document.getElementById('main-view').classList.add('hidden');

  // Set heading from standalone config if present
  var heading = document.querySelector('.setup-header h1');
  if (heading && standaloneConfig && standaloneConfig.title) {
    heading.textContent = standaloneConfig.title;
  }

  var backBtn = document.getElementById('setup-back-btn');
  if (canGoBack) {
    backBtn.classList.remove('hidden');
  } else {
    backBtn.classList.add('hidden');
  }

  renderSetupVendors();
}

function hideSetup() {
  document.getElementById('setup-view').classList.add('hidden');
  showMainView();
}

function showSettings() {
  // Re-fetch status in case keys changed externally
  fetch(API + '/api/setup/status')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      vendorSetupStatus = data.vendors;
      showSetup(true);
    })
    .catch(function() {
      showSetup(true);
    });
}

function renderSetupVendors() {
  var container = document.getElementById('setup-vendors');
  container.innerHTML = '';

  for (var name in vendorSetupStatus) {
    var v = vendorSetupStatus[name];
    var row = document.createElement('div');
    row.className = 'setup-vendor-row';

    // Vendor toggle label
    var label = document.createElement('label');
    label.className = 'setup-vendor-label';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = v.configured;
    cb.dataset.vendor = name;
    cb.onchange = (function(vendorName) {
      return function() { toggleSetupKey(vendorName); };
    })(name);
    label.appendChild(cb);

    var nameSpan = document.createElement('span');
    nameSpan.className = 'setup-vendor-name';
    nameSpan.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    label.appendChild(nameSpan);

    var countSpan = document.createElement('span');
    countSpan.className = 'setup-vendor-count';
    countSpan.textContent = v.model_count + ' model' + (v.model_count !== 1 ? 's' : '');
    label.appendChild(countSpan);

    row.appendChild(label);

    // Key input area
    var keyWrap = document.createElement('div');
    keyWrap.className = 'setup-key-wrap' + (v.configured ? '' : ' hidden');
    keyWrap.id = 'setup-key-' + name;

    var keyRow = document.createElement('div');
    keyRow.className = 'setup-key-row';

    var keyInput = document.createElement('input');
    keyInput.type = 'password';
    keyInput.className = 'setup-key-input';
    keyInput.id = 'key-input-' + name;
    keyInput.placeholder = v.env_var;
    keyInput.dataset.envVar = v.env_var;
    keyInput.dataset.vendor = name;

    if (v.configured) {
      keyInput.value = MASKED_KEY;
      keyInput.dataset.isMasked = 'true';
    }

    keyInput.addEventListener('focus', function() {
      if (this.dataset.isMasked === 'true') {
        this.value = '';
        this.dataset.isMasked = 'false';
      }
    });

    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'setup-key-toggle';
    toggleBtn.textContent = 'show';
    toggleBtn.onclick = (function(inp, btn) {
      return function() {
        if (inp.type === 'password') {
          inp.type = 'text';
          btn.textContent = 'hide';
        } else {
          inp.type = 'password';
          btn.textContent = 'show';
        }
      };
    })(keyInput, toggleBtn);

    var testBtn = document.createElement('button');
    testBtn.className = 'setup-test-btn';
    testBtn.textContent = 'Test';
    testBtn.id = 'test-btn-' + name;
    testBtn.onclick = (function(vendorName) {
      return function() { testSetupKey(vendorName); };
    })(name);

    keyRow.appendChild(keyInput);
    keyRow.appendChild(toggleBtn);
    keyRow.appendChild(testBtn);
    keyWrap.appendChild(keyRow);

    var testResult = document.createElement('div');
    testResult.className = 'setup-test-result hidden';
    testResult.id = 'test-result-' + name;
    keyWrap.appendChild(testResult);

    row.appendChild(keyWrap);
    container.appendChild(row);
  }
}

function toggleSetupKey(vendorName) {
  var wrap = document.getElementById('setup-key-' + vendorName);
  if (wrap) wrap.classList.toggle('hidden');
}


// ---------------------------------------------------------------------------
// Test API Key (during setup)
// ---------------------------------------------------------------------------

async function testSetupKey(vendorName) {
  var input = document.getElementById('key-input-' + vendorName);
  var btn = document.getElementById('test-btn-' + vendorName);
  var result = document.getElementById('test-result-' + vendorName);
  var apiKey = input.value.trim();
  var isMasked = input.dataset.isMasked === 'true';

  // If key is still masked, test with the saved key (don't send it — server uses .env)
  var payload = { vendor: vendorName };
  if (!isMasked && apiKey) {
    payload.api_key = apiKey;
  } else if (isMasked) {
    // Use saved key — don't pass api_key, server falls back to .env
  } else {
    result.textContent = 'Enter an API key first.';
    result.className = 'setup-test-result error';
    result.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Testing...';
  result.textContent = 'Connecting...';
  result.className = 'setup-test-result';
  result.classList.remove('hidden');

  try {
    var res = await fetch(API + '/api/models/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.detail || 'Test failed');
    }

    var data = await res.json();
    result.textContent = 'Connected to ' + data.model_id + ' (' + data.latency_ms + 'ms)';
    result.className = 'setup-test-result success';
  } catch (e) {
    result.textContent = e.message;
    result.className = 'setup-test-result error';
  }

  btn.disabled = false;
  btn.textContent = 'Test';
}


// ---------------------------------------------------------------------------
// Save Setup
// ---------------------------------------------------------------------------

async function saveSetup() {
  var btn = document.getElementById('setup-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  var keys = {};
  var inputs = document.querySelectorAll('.setup-key-input');
  for (var i = 0; i < inputs.length; i++) {
    var val = inputs[i].value.trim();
    var isMasked = inputs[i].dataset.isMasked === 'true';
    if (val && !isMasked) {
      keys[inputs[i].dataset.envVar] = val;
    }
  }

  if (Object.keys(keys).length === 0) {
    // Check if any keys are already saved (masked)
    var anyMasked = false;
    for (var j = 0; j < inputs.length; j++) {
      if (inputs[j].dataset.isMasked === 'true') { anyMasked = true; break; }
    }

    if (!anyMasked) {
      btn.disabled = false;
      btn.textContent = 'Save & Continue';
      showSetupMessage('Enter at least one API key to continue.', true);
      return;
    }

    // All keys are already saved — just go to main view
    btn.disabled = false;
    btn.textContent = 'Save & Continue';
    hideSetup();
    return;
  }

  try {
    var res = await fetch(API + '/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: keys }),
    });

    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.detail || 'Failed to save');
    }

    // Refresh setup status and go to main view
    var statusRes = await fetch(API + '/api/setup/status').then(function(r) { return r.json(); });
    vendorSetupStatus = statusRes.vendors;

    btn.disabled = false;
    btn.textContent = 'Save & Continue';
    hideSetup();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Save & Continue';
    showSetupMessage('Error: ' + e.message, true);
  }
}

function showSetupMessage(text, isError) {
  var msg = document.getElementById('setup-message');
  msg.textContent = text;
  msg.className = 'setup-message' + (isError ? ' error' : '');
  msg.classList.remove('hidden');
}


// ---------------------------------------------------------------------------
// Add Model Dialog
// ---------------------------------------------------------------------------

function showAddModelDialog() {
  var overlay = document.getElementById('add-model-overlay');
  var select = document.getElementById('add-model-vendor');
  var hint = document.getElementById('add-model-vendor-hint');

  // Populate vendor dropdown — all vendors, mark unconfigured
  select.innerHTML = '<option value="">Select vendor...</option>';
  var hasUnconfigured = false;

  for (var name in vendorSetupStatus) {
    var v = vendorSetupStatus[name];
    var opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    if (!v.configured) {
      opt.disabled = true;
      opt.textContent += ' (no API key)';
      hasUnconfigured = true;
    }
    select.appendChild(opt);
  }

  if (hasUnconfigured) {
    hint.textContent = 'Configure missing API keys in Settings.';
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }

  document.getElementById('add-model-id').value = '';
  document.getElementById('add-model-label').value = '';
  var msg = document.getElementById('add-model-message');
  msg.classList.add('hidden');

  var btn = document.getElementById('add-model-test-btn');
  btn.disabled = false;
  btn.textContent = 'Test & Add';

  overlay.classList.remove('hidden');
}

function closeAddModel(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('add-model-overlay').classList.add('hidden');
}

async function testAndAddModel() {
  var vendor = document.getElementById('add-model-vendor').value;
  var modelId = document.getElementById('add-model-id').value.trim();
  var label = document.getElementById('add-model-label').value.trim();
  var btn = document.getElementById('add-model-test-btn');
  var msg = document.getElementById('add-model-message');

  if (!vendor || !modelId || !label) {
    msg.textContent = 'All fields are required.';
    msg.className = 'dialog-message error';
    msg.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Testing...';
  msg.textContent = 'Testing connection to ' + modelId + '...';
  msg.className = 'dialog-message';
  msg.classList.remove('hidden');

  // Step 1: Test the model
  try {
    var testRes = await fetch(API + '/api/models/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor: vendor, model_id: modelId }),
    });

    if (!testRes.ok) {
      var err = await testRes.json();
      throw new Error(err.detail || 'Test failed');
    }

    var testData = await testRes.json();
    msg.textContent = 'Connected (' + testData.latency_ms + 'ms). Adding model...';
    msg.className = 'dialog-message success';
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Test & Add';
    msg.textContent = e.message;
    msg.className = 'dialog-message error';
    return;
  }

  // Step 2: Add the model to vendor config
  try {
    var addRes = await fetch(API + '/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendor: vendor, model_id: modelId, label: label }),
    });

    if (!addRes.ok) {
      var err = await addRes.json();
      throw new Error(err.detail || 'Failed to add');
    }

    // Refresh models panel and close dialog
    var modelsRes = await fetch(API + '/api/models').then(function(r) { return r.json(); });
    renderModels(modelsRes.vendors);
    closeAddModel();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Test & Add';
    msg.textContent = e.message;
    msg.className = 'dialog-message error';
    return;
  }

  btn.disabled = false;
  btn.textContent = 'Test & Add';
}
