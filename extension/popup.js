/* global chrome */

/**
 * TrackMe Extension - Popup Controller
 * Manages employee session state (Clock in, Break, Clock out)
 * and synchronizes telemetry with the Next.js Supervisory Hub.
 */

const DEFAULT_SERVER_URL = 'http://localhost:3000';

// State
let currentStatus = 'offline';
let sessionStartedAt = null;
let sessionId = null;
let organizationId = null;
let serverUrl = DEFAULT_SERVER_URL;
let authToken = '';
let timerInterval = null;

// DOM Elements
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const timerValue = document.getElementById('timer-value');
const sessionTimeLabel = document.getElementById('session-time-label');

const activityBox = document.getElementById('activity-box');
const activityApp = document.getElementById('activity-app');
const activityTitle = document.getElementById('activity-title');

const viewClockedOut = document.getElementById('view-clocked-out');
const viewActive = document.getElementById('view-active');
const viewBreak = document.getElementById('view-break');

const btnClockIn = document.getElementById('btn-clock-in');
const btnStartBreak = document.getElementById('btn-start-break');
const btnEndBreak = document.getElementById('btn-end-break');
const btnClockOutActive = document.getElementById('btn-clock-out-active');
const btnClockOutBreak = document.getElementById('btn-clock-out-break');

const btnToggleSettings = document.getElementById('btn-toggle-settings');
const settingsPanel = document.getElementById('settings-panel');
const inputServerUrl = document.getElementById('input-server-url');
const inputAuthToken = document.getElementById('input-auth-token');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnTestConnection = document.getElementById('btn-test-connection');

const alertBanner = document.getElementById('alert-banner');
const alertMessage = document.getElementById('alert-message');
const btnCloseAlert = document.getElementById('btn-close-alert');

const queueCount = document.getElementById('queue-count');
const syncStatus = document.getElementById('sync-status');
const btnSyncNow = document.getElementById('btn-sync-now');

// Helper to show banners
function showAlert(message, type = 'error', duration = 5000) {
  alertBanner.className = `alert-banner ${type}`;
  alertMessage.textContent = message;
  alertBanner.classList.remove('hidden');

  if (duration > 0) {
    setTimeout(() => {
      alertBanner.classList.add('hidden');
    }, duration);
  }
}

// Format seconds into HH:MM:SS
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Update the duration timer display
function updateTimer() {
  if (!sessionStartedAt || currentStatus === 'offline') {
    timerValue.textContent = '00:00:00';
    return;
  }

  const startMs = new Date(sessionStartedAt).getTime();
  const nowMs = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  timerValue.textContent = formatTime(elapsedSeconds);
}

function startTimer() {
  stopTimer();
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Render UI according to current status
function renderUI() {
  // Reset classes
  statusBadge.className = 'status-badge';

  if (currentStatus === 'active') {
    statusBadge.classList.add('status-active');
    statusText.textContent = 'Active Working';
    sessionTimeLabel.textContent = 'Session In Progress';

    viewClockedOut.classList.add('hidden');
    viewActive.classList.remove('hidden');
    viewBreak.classList.add('hidden');

    activityBox.classList.remove('hidden');
    startTimer();
  } else if (currentStatus === 'paused') {
    statusBadge.classList.add('status-paused');
    statusText.textContent = 'On Break';
    sessionTimeLabel.textContent = 'Break Active';

    viewClockedOut.classList.add('hidden');
    viewActive.classList.add('hidden');
    viewBreak.classList.remove('hidden');

    activityBox.classList.add('hidden');
    startTimer();
  } else {
    statusBadge.classList.add('status-offline');
    statusText.textContent = 'Offline';
    sessionTimeLabel.textContent = 'Session Elapsed';

    viewClockedOut.classList.remove('hidden');
    viewActive.classList.add('hidden');
    viewBreak.classList.add('hidden');

    activityBox.classList.add('hidden');
    stopTimer();
    timerValue.textContent = '00:00:00';
  }
}

// Fetch headers helper
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

// Load state from chrome.storage.local
async function loadState() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (!response) return;

    currentStatus = response.sessionStatus || 'offline';
    sessionId = response.sessionId;
    organizationId = response.organizationId;
    sessionStartedAt = response.sessionStartedAt;
    serverUrl = response.serverUrl || DEFAULT_SERVER_URL;
    authToken = response.authToken || '';

    inputServerUrl.value = serverUrl;
    inputAuthToken.value = authToken;

    queueCount.textContent = response.queueLength ?? 0;
    syncStatus.textContent = response.lastSyncStatus === 'success' ? 'Synced' : 'Idle';

    if (response.lastActiveTab) {
      activityApp.textContent = response.lastActiveTab.appName || 'Web Browser';
      activityTitle.textContent = response.lastActiveTab.title || response.lastActiveTab.domain || 'Active Page';
    }

    renderUI();
  });
}

// Clock In / Mark Attendance
async function handleClockIn() {
  btnClockIn.disabled = true;
  btnClockIn.textContent = 'Clocking In...';

  try {
    const res = await fetch(`${serverUrl}/api/v1/sessions/clock-in`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include'
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(`Unauthorized. Please log in to TrackMe at ${serverUrl} or configure your auth token in settings.`);
      }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Server responded with ${res.status}`);
    }

    const data = await res.json();
    if (!data.sessionId || !data.organizationId) {
      throw new Error('Invalid server response: missing sessionId or organizationId');
    }

    sessionId = data.sessionId;
    organizationId = data.organizationId;
    sessionStartedAt = new Date().toISOString();
    currentStatus = 'active';

    await chrome.storage.local.set({
      sessionId,
      organizationId,
      sessionStartedAt,
      sessionStatus: 'active'
    });

    // Notify background to start telemetry tick
    chrome.runtime.sendMessage({ type: 'CAPTURE_TICK', reason: 'clock_in_click' });

    showAlert('Clocked in successfully!', 'success');
    renderUI();
  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    btnClockIn.disabled = false;
    btnClockIn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>Clock In / Mark Attendance</span>
    `;
  }
}

// Start Break
async function handleStartBreak() {
  btnStartBreak.disabled = true;

  try {
    const res = await fetch(`${serverUrl}/api/v1/sessions/break`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        session_id: sessionId,
        organization_id: organizationId,
        type: 'break_start'
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to start break: ${res.status}`);
    }

    currentStatus = 'paused';
    await chrome.storage.local.set({ sessionStatus: 'paused' });
    showAlert('Break started. Telemetry paused.', 'info');
    renderUI();
  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    btnStartBreak.disabled = false;
  }
}

// End Break
async function handleEndBreak() {
  btnEndBreak.disabled = true;

  try {
    const res = await fetch(`${serverUrl}/api/v1/sessions/break`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        session_id: sessionId,
        organization_id: organizationId,
        type: 'break_end'
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to resume work: ${res.status}`);
    }

    currentStatus = 'active';
    await chrome.storage.local.set({ sessionStatus: 'active' });
    chrome.runtime.sendMessage({ type: 'CAPTURE_TICK', reason: 'resume_work' });
    showAlert('Welcome back! Tracking resumed.', 'success');
    renderUI();
  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    btnEndBreak.disabled = false;
  }
}

// Clock Out
async function handleClockOut() {
  const confirmClockOut = confirm('Are you sure you want to clock out and end this session?');
  if (!confirmClockOut) return;

  btnClockOutActive.disabled = true;
  btnClockOutBreak.disabled = true;

  try {
    // Flush any pending events first
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'FLUSH_AND_RESET' }, () => resolve());
    });

    const res = await fetch(`${serverUrl}/api/v1/sessions/clock-out`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ session_id: sessionId })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Clock out error: ${res.status}`);
    }

    currentStatus = 'offline';
    sessionId = null;
    sessionStartedAt = null;

    await chrome.storage.local.set({
      sessionStatus: 'offline',
      sessionId: null,
      sessionStartedAt: null
    });

    showAlert('Clocked out successfully.', 'info');
    renderUI();
  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    btnClockOutActive.disabled = false;
    btnClockOutBreak.disabled = false;
  }
}

// Force sync now
function handleSyncNow() {
  btnSyncNow.disabled = true;
  syncStatus.textContent = 'Syncing...';

  chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (response) => {
    btnSyncNow.disabled = false;
    if (response && response.success) {
      syncStatus.textContent = 'Synced';
      showAlert(`Synced ${response.count ?? 0} events.`, 'success', 3000);
    } else {
      syncStatus.textContent = 'Sync Error';
      showAlert(response?.error || 'Failed to sync events.', 'error');
    }
    loadState();
  });
}

// Save Settings
async function handleSaveSettings() {
  const urlVal = inputServerUrl.value.trim() || DEFAULT_SERVER_URL;
  const tokenVal = inputAuthToken.value.trim();

  serverUrl = urlVal;
  authToken = tokenVal;

  await chrome.storage.local.set({
    serverUrl,
    authToken
  });

  settingsPanel.classList.add('hidden');
  showAlert('Settings saved successfully.', 'success', 2500);
}

// Test Connection
async function handleTestConnection() {
  btnTestConnection.disabled = true;
  btnTestConnection.textContent = 'Testing...';

  const testUrl = inputServerUrl.value.trim() || DEFAULT_SERVER_URL;
  const token = inputAuthToken.value.trim();

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${testUrl}/api/v1/sessions/clock-in`, {
      method: 'OPTIONS',
      headers,
      credentials: 'include'
    });

    if (res.ok || res.status === 204 || res.status === 401) {
      showAlert(`Connected to ${testUrl} (${res.status === 401 ? 'Requires Login' : 'Ready'})`, 'success');
    } else {
      showAlert(`Server returned status ${res.status}`, 'error');
    }
  } catch (err) {
    showAlert(`Could not connect to ${testUrl}: ${err.message}`, 'error');
  } finally {
    btnTestConnection.disabled = false;
    btnTestConnection.textContent = 'Test Connection';
  }
}

// Event Listeners
btnClockIn.addEventListener('click', handleClockIn);
btnStartBreak.addEventListener('click', handleStartBreak);
btnEndBreak.addEventListener('click', handleEndBreak);
btnClockOutActive.addEventListener('click', handleClockOut);
btnClockOutBreak.addEventListener('click', handleClockOut);

btnToggleSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

btnSaveSettings.addEventListener('click', handleSaveSettings);
btnTestConnection.addEventListener('click', handleTestConnection);
btnCloseAlert.addEventListener('click', () => alertBanner.classList.add('hidden'));
btnSyncNow.addEventListener('click', handleSyncNow);

// Storage change listener to keep UI synchronized across tabs/windows
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.sessionStatus) {
    currentStatus = changes.sessionStatus.newValue || 'offline';
    renderUI();
  }
  if (changes.eventQueue) {
    const queue = changes.eventQueue.newValue;
    queueCount.textContent = Array.isArray(queue) ? queue.length : 0;
  }
  if (changes.lastActiveTab && changes.lastActiveTab.newValue) {
    const tab = changes.lastActiveTab.newValue;
    activityApp.textContent = tab.appName || 'Web Browser';
    activityTitle.textContent = tab.title || tab.domain || 'Active Page';
  }
});

// Initial boot
loadState();
