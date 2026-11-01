/* global chrome */

/**
 * TrackMe Extension - Popup Controller
 * Manages employee session state (Clock in, Break, Clock out)
 * and synchronizes telemetry with the Next.js Supervisory Hub.
 */

const DEFAULT_SERVER_URL = 'http://localhost:3000';

// State
let isAuthenticated = false;
let currentStatus = 'offline';
let sessionStartedAt = null;
let sessionId = null;
let organizationId = null;
let organizationName = null;
let employeeProfile = null;
let serverUrl = DEFAULT_SERVER_URL;
let authToken = '';
let timerInterval = null;
let approvalStatus = 'approved';

// DOM Elements
const viewAuth = document.getElementById('view-auth');
const viewAuthenticated = document.getElementById('view-authenticated');
const formLogin = document.getElementById('form-login');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const btnDoLogin = document.getElementById('btn-do-login');
const btnSignOut = document.getElementById('btn-sign-out');

const employeeNameEl = document.getElementById('employee-name');
const employeeOrgEl = document.getElementById('employee-org');
const badgeRole = document.getElementById('badge-role');
const badgeApproval = document.getElementById('badge-approval');

const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const timerValue = document.getElementById('timer-value');
const sessionTimeLabel = document.getElementById('session-time-label');

const activityBox = document.getElementById('activity-box');
const activityApp = document.getElementById('activity-app');
const activityTitle = document.getElementById('activity-title');

const viewPending = document.getElementById('view-pending');
const btnCheckApproval = document.getElementById('btn-check-approval');
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

// Update duration timer display
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

// Render UI according to auth state and current session status
function renderUI() {
  if (!isAuthenticated) {
    viewAuth.classList.remove('hidden');
    viewAuthenticated.classList.add('hidden');
    stopTimer();
    return;
  }

  viewAuth.classList.add('hidden');
  viewAuthenticated.classList.remove('hidden');

  // Populate profile header
  if (employeeProfile) {
    employeeNameEl.textContent = employeeProfile.fullName || employeeProfile.email || 'Employee';
    employeeOrgEl.textContent = organizationName || employeeProfile.organizationName || 'Organization Roster';
    badgeRole.textContent = employeeProfile.role || 'employee';

    if (approvalStatus === 'pending') {
      badgeApproval.className = 'approval-badge approval-pending';
      badgeApproval.textContent = 'Pending Approval';
    } else {
      badgeApproval.className = 'approval-badge approval-approved';
      badgeApproval.textContent = 'Approved';
    }
  }

  // Reset status classes
  statusBadge.className = 'status-badge';

  if (approvalStatus === 'pending') {
    statusBadge.classList.add('status-pending');
    statusText.textContent = 'Pending Approval';
    sessionTimeLabel.textContent = 'Account Locked';

    viewPending.classList.remove('hidden');
    viewClockedOut.classList.add('hidden');
    viewActive.classList.add('hidden');
    viewBreak.classList.add('hidden');
    activityBox.classList.add('hidden');

    stopTimer();
    timerValue.textContent = '00:00:00';
    return;
  }

  viewPending.classList.add('hidden');

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

// Load state from chrome.storage.local and verify auth
async function loadState() {
  chrome.storage.local.get([
    'serverUrl',
    'authToken',
    'userProfile',
    'sessionStatus',
    'approvalStatus',
    'sessionId',
    'organizationId',
    'organizationName',
    'sessionStartedAt',
    'eventQueue',
    'lastSyncStatus',
    'lastActiveTab'
  ], async (items) => {
    serverUrl = items.serverUrl || DEFAULT_SERVER_URL;
    authToken = items.authToken || '';
    employeeProfile = items.userProfile || null;
    currentStatus = items.sessionStatus || 'offline';
    approvalStatus = items.approvalStatus || 'approved';
    sessionId = items.sessionId || null;
    organizationId = items.organizationId || null;
    organizationName = items.organizationName || null;
    sessionStartedAt = items.sessionStartedAt || null;

    inputServerUrl.value = serverUrl;
    inputAuthToken.value = authToken;

    queueCount.textContent = Array.isArray(items.eventQueue) ? items.eventQueue.length : 0;
    syncStatus.textContent = items.lastSyncStatus === 'success' ? 'Synced' : 'Idle';

    if (items.lastActiveTab) {
      activityApp.textContent = items.lastActiveTab.appName || 'Web Browser';
      activityTitle.textContent = items.lastActiveTab.title || items.lastActiveTab.domain || 'Active Page';
    }

    // Check with server if authenticated
    try {
      const res = await fetch(`${serverUrl}/api/v1/auth/status`, {
        method: 'GET',
        headers: getHeaders(),
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          isAuthenticated = true;
          employeeProfile = {
            id: data.userId,
            email: data.email,
            fullName: data.fullName,
            username: data.username,
            role: data.role,
            approvalStatus: data.approvalStatus
          };
          organizationId = data.organizationId || organizationId;
          organizationName = data.organizationName || organizationName;
          approvalStatus = data.approvalStatus || 'approved';

          await chrome.storage.local.set({
            userProfile: employeeProfile,
            organizationId,
            organizationName,
            approvalStatus
          });
        } else {
          // If token expired or not logged in
          if (authToken) {
            isAuthenticated = false;
          } else {
            isAuthenticated = false;
          }
        }
      } else {
        // If server error, fallback to cached state if token exists
        isAuthenticated = Boolean(authToken || employeeProfile);
      }
    } catch {
      // Offline fallback
      isAuthenticated = Boolean(authToken || employeeProfile);
    }

    renderUI();
  });
}

// Login Handler
async function handleLogin(e) {
  e.preventDefault();
  const usernameOrEmail = loginUsername.value.trim();
  const password = loginPassword.value.trim();

  if (!usernameOrEmail || !password) {
    showAlert('Please enter your credentials.', 'error');
    return;
  }

  btnDoLogin.disabled = true;
  btnDoLogin.textContent = 'Authenticating...';

  try {
    const res = await fetch(`${serverUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ usernameOrEmail, password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Login failed. Please verify credentials.');
    }

    authToken = data.token;
    employeeProfile = data.user;
    organizationId = data.user.organizationId;
    organizationName = data.user.organizationName;
    approvalStatus = data.user.approvalStatus || 'approved';
    isAuthenticated = true;

    await chrome.storage.local.set({
      authToken,
      userProfile: employeeProfile,
      organizationId,
      organizationName,
      approvalStatus
    });

    showAlert('Signed in successfully!', 'success', 3000);
    renderUI();
  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    btnDoLogin.disabled = false;
    btnDoLogin.textContent = 'Sign In';
  }
}

// Sign Out Handler
async function handleSignOut() {
  stopTimer();
  authToken = '';
  employeeProfile = null;
  isAuthenticated = false;
  currentStatus = 'offline';
  sessionId = null;
  sessionStartedAt = null;

  await chrome.storage.local.set({
    authToken: '',
    userProfile: null,
    sessionId: null,
    sessionStartedAt: null,
    sessionStatus: 'offline'
  });

  showAlert('Signed out of extension.', 'info', 2500);
  renderUI();
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
        isAuthenticated = false;
        renderUI();
        throw new Error('Session expired. Please sign in again.');
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.approval_status === 'pending') {
        approvalStatus = 'pending';
        await chrome.storage.local.set({ approvalStatus: 'pending' });
        renderUI();
        throw new Error('Account Pending Manager Approval. Your manager must approve your access before you can clock in.');
      }
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
      throw new Error(data.error || `Failed to resume session: ${res.status}`);
    }

    currentStatus = 'active';
    await chrome.storage.local.set({ sessionStatus: 'active' });

    chrome.runtime.sendMessage({ type: 'CAPTURE_TICK', reason: 'break_end_click' });

    showAlert('Resumed work session.', 'success');
    renderUI();
  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    btnEndBreak.disabled = false;
  }
}

// Clock Out
async function handleClockOut() {
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
  loadState();
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
    const res = await fetch(`${testUrl}/api/v1/auth/status`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    if (res.ok) {
      const data = await res.json();
      showAlert(`Connected to ${testUrl} (${data.authenticated ? 'Authenticated as ' + data.email : 'Ready - Not Logged In'})`, 'success');
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
if (formLogin) {
  formLogin.addEventListener('submit', handleLogin);
}

if (btnSignOut) {
  btnSignOut.addEventListener('click', handleSignOut);
}

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

if (btnCheckApproval) {
  btnCheckApproval.addEventListener('click', () => {
    btnCheckApproval.disabled = true;
    btnCheckApproval.textContent = 'Checking Status...';
    chrome.runtime.sendMessage({ type: 'CHECK_APPROVAL' }, (res) => {
      btnCheckApproval.disabled = false;
      btnCheckApproval.textContent = 'Check Approval Status';
      if (res && res.success) {
        approvalStatus = res.approvalStatus;
        renderUI();
        if (approvalStatus === 'approved') {
          showAlert('Account approved! Controls unlocked.', 'success');
        } else if (approvalStatus === 'pending') {
          showAlert('Account still pending manager approval.', 'warning');
        } else if (approvalStatus === 'rejected') {
          showAlert('Account access rejected.', 'error');
        }
      } else {
        showAlert(res?.error || 'Could not verify status with server.', 'error');
      }
    });
  });
}

// Storage change listener to keep UI synchronized across tabs/windows
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.authToken) {
    authToken = changes.authToken.newValue || '';
    isAuthenticated = Boolean(authToken);
    renderUI();
  }
  if (changes.userProfile) {
    employeeProfile = changes.userProfile.newValue || null;
    renderUI();
  }
  if (changes.sessionStatus) {
    currentStatus = changes.sessionStatus.newValue || 'offline';
    renderUI();
  }
  if (changes.approvalStatus) {
    approvalStatus = changes.approvalStatus.newValue || 'approved';
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
