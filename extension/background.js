/* global chrome */

/**
 * TrackMe Extension - Background Telemetry Worker (Manifest V3)
 * Tracks active tabs, employee idle states, and syncs buffered telemetry ticks
 * to the Next.js Supervisory Hub.
 */

const DEFAULT_SERVER_URL = 'http://localhost:3000';
const IDLE_DETECTION_SECONDS = 300; // 5-minute threshold
const SYNC_ALARM_NAME = 'sync_events';
const SYNC_INTERVAL_MINUTES = 0.25; // 15 seconds
const MAX_QUEUE_SIZE = 1000;

// Promise wrappers for chrome.storage.local
function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items || {}));
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

// Generate unique UUID v4 for idempotency
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Helper to extract clean domain from URL
function extractDomain(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.hostname;
    }
    return parsed.protocol.replace(':', '');
  } catch {
    return '';
  }
}

// Helper to derive human-friendly app name from domain and title
function deriveAppName(url, title) {
  const domain = extractDomain(url).toLowerCase();

  const domainMap = {
    'github.com': 'GitHub',
    'gitlab.com': 'GitLab',
    'bitbucket.org': 'Bitbucket',
    'stackoverflow.com': 'Stack Overflow',
    'docs.google.com': 'Google Docs',
    'sheets.google.com': 'Google Sheets',
    'slides.google.com': 'Google Slides',
    'drive.google.com': 'Google Drive',
    'mail.google.com': 'Gmail',
    'calendar.google.com': 'Google Calendar',
    'google.com': 'Google Search',
    'notion.so': 'Notion',
    'linear.app': 'Linear',
    'slack.com': 'Slack',
    'figma.com': 'Figma',
    'jira.atlassian.com': 'Jira',
    'atlassian.net': 'Atlassian',
    'trello.com': 'Trello',
    'youtube.com': 'YouTube',
    'linkedin.com': 'LinkedIn',
    'twitter.com': 'X / Twitter',
    'x.com': 'X / Twitter',
    'reddit.com': 'Reddit',
    'localhost': 'Localhost / Dev Server',
    '127.0.0.1': 'Localhost / Dev Server'
  };

  for (const [key, name] of Object.entries(domainMap)) {
    if (domain === key || domain.endsWith('.' + key)) {
      return name;
    }
  }

  if (domain && domain !== 'http' && domain !== 'https') {
    // Convert foo.example.com to Example.com or Example
    const parts = domain.split('.');
    if (parts.length >= 2) {
      const mainPart = parts[parts.length - 2];
      return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
    }
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  if (title) {
    const cleanTitle = title.trim();
    if (cleanTitle.length > 20) {
      return cleanTitle.slice(0, 20) + '...';
    }
    return cleanTitle;
  }

  return 'Web Browser';
}

// Get idle status via chrome.idle API
function queryIdleState() {
  return new Promise((resolve) => {
    if (!chrome.idle || !chrome.idle.queryState) {
      resolve('active');
      return;
    }
    chrome.idle.queryState(IDLE_DETECTION_SECONDS, (state) => {
      resolve(state || 'active');
    });
  });
}

// Query current active tab in current window
function getActiveTab() {
  return new Promise((resolve) => {
    if (!chrome.tabs || !chrome.tabs.query) {
      resolve(null);
      return;
    }
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        resolve(tabs[0]);
      } else {
        // Fallback: check any active tab
        chrome.tabs.query({ active: true }, (allTabs) => {
          resolve(allTabs && allTabs.length > 0 ? allTabs[0] : null);
        });
      }
    });
  });
}

// Record a telemetry tick into chrome.storage.local queue
async function captureTick(reason = 'tick') {
  const storage = await getStorage([
    'sessionStatus',
    'sessionId',
    'organizationId',
    'eventQueue'
  ]);

  if (storage.sessionStatus !== 'active' || !storage.sessionId || !storage.organizationId) {
    return;
  }

  const [activeTab, idleState] = await Promise.all([
    getActiveTab(),
    queryIdleState()
  ]);

  const isActive = idleState === 'active';
  const eventType = isActive ? 'active_tick' : 'idle_tick';
  const url = activeTab?.url || '';
  const domain = extractDomain(url);
  const windowTitle = activeTab?.title || (isActive ? 'Active Browser Window' : 'Idle');
  const appName = deriveAppName(url, activeTab?.title);

  const tick = {
    idempotency_key: generateUUID(),
    timestamp: new Date().toISOString(),
    is_active: isActive,
    event_type: eventType,
    window_title: windowTitle,
    app_name: appName,
    payload: {
      domain,
      url,
      reason
    }
  };

  const queue = Array.isArray(storage.eventQueue) ? storage.eventQueue : [];
  queue.push(tick);

  // Guard against runaway memory growth if offline for hours
  if (queue.length > MAX_QUEUE_SIZE) {
    queue.splice(0, queue.length - MAX_QUEUE_SIZE);
  }

  await setStorage({
    eventQueue: queue,
    lastActiveTab: {
      domain,
      url,
      title: windowTitle,
      appName,
      isActive,
      timestamp: tick.timestamp
    }
  });
}

// Sync buffered events to Next.js API
async function syncEvents() {
  const storage = await getStorage([
    'serverUrl',
    'sessionId',
    'organizationId',
    'authToken',
    'eventQueue'
  ]);

  const queue = Array.isArray(storage.eventQueue) ? storage.eventQueue : [];
  if (queue.length === 0 || !storage.sessionId || !storage.organizationId) {
    return { synced: 0, pending: queue.length };
  }

  const serverUrl = storage.serverUrl || DEFAULT_SERVER_URL;
  const batch = queue.slice(0, 50); // Send in batches of 50

  const headers = {
    'Content-Type': 'application/json'
  };
  if (storage.authToken) {
    headers['Authorization'] = `Bearer ${storage.authToken}`;
  }

  try {
    const res = await fetch(`${serverUrl}/api/v1/events/sync`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        session_id: storage.sessionId,
        organization_id: storage.organizationId,
        events: batch
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      await setStorage({
        lastSyncStatus: 'error',
        lastSyncError: `Server error ${res.status}: ${errorText.slice(0, 100)}`
      });
      return { success: false, error: res.statusText };
    }

    // Successfully sent batch, remove from queue using idempotency keys
    const sentKeys = new Set(batch.map((e) => e.idempotency_key));
    const freshStorage = await getStorage(['eventQueue']);
    const currentQueue = Array.isArray(freshStorage.eventQueue) ? freshStorage.eventQueue : [];
    const remainingQueue = currentQueue.filter((e) => !sentKeys.has(e.idempotency_key));

    await setStorage({
      eventQueue: remainingQueue,
      lastSyncTime: Date.now(),
      lastSyncStatus: 'success',
      lastSyncError: null
    });

    return { success: true, count: batch.length, remaining: remainingQueue.length };
  } catch (err) {
    await setStorage({
      lastSyncStatus: 'error',
      lastSyncError: err instanceof Error ? err.message : 'Network error'
    });
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// Flush all events until queue is empty
async function flushAllEvents() {
  let attempts = 0;
  while (attempts < 5) {
    const storage = await getStorage(['eventQueue']);
    const queue = Array.isArray(storage.eventQueue) ? storage.eventQueue : [];
    if (queue.length === 0) break;
    const result = await syncEvents();
    if (!result.success) break;
    attempts++;
  }
}

// Initialize alarm for periodic telemetry and sync
function setupAlarms() {
  if (!chrome.alarms) return;
  chrome.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES
  });
}

// Initialize extension lifecycle
function initialize() {
  if (chrome.idle && chrome.idle.setDetectionInterval) {
    chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
  }
  setupAlarms();
}

initialize();

// Alarms listener
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === SYNC_ALARM_NAME) {
      const storage = await getStorage(['sessionStatus']);
      if (storage.sessionStatus === 'active') {
        await captureTick('periodic_alarm');
      }
      await syncEvents();
    }
  });
}

// Active Tab Listeners
if (chrome.tabs) {
  chrome.tabs.onActivated.addListener(async () => {
    const storage = await getStorage(['sessionStatus']);
    if (storage.sessionStatus === 'active') {
      await captureTick('tab_switch');
    }
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url)) {
      const storage = await getStorage(['sessionStatus']);
      if (storage.sessionStatus === 'active') {
        await captureTick('tab_updated');
      }
    }
  });
}

// Idle state change listener
if (chrome.idle) {
  chrome.idle.onStateChanged.addListener(async () => {
    const storage = await getStorage(['sessionStatus']);
    if (storage.sessionStatus === 'active') {
      await captureTick('idle_state_changed');
    }
  });
}

// Runtime Message Handling from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_STATUS') {
    getStorage([
      'sessionStatus',
      'approvalStatus',
      'sessionId',
      'organizationId',
      'sessionStartedAt',
      'serverUrl',
      'authToken',
      'eventQueue',
      'lastSyncTime',
      'lastSyncStatus',
      'lastSyncError',
      'lastActiveTab'
    ]).then((data) => {
      sendResponse({
        sessionStatus: data.sessionStatus || 'offline',
        approvalStatus: data.approvalStatus || 'approved',
        sessionId: data.sessionId || null,
        organizationId: data.organizationId || null,
        sessionStartedAt: data.sessionStartedAt || null,
        serverUrl: data.serverUrl || DEFAULT_SERVER_URL,
        queueLength: Array.isArray(data.eventQueue) ? data.eventQueue.length : 0,
        lastSyncTime: data.lastSyncTime || null,
        lastSyncStatus: data.lastSyncStatus || 'idle',
        lastSyncError: data.lastSyncError || null,
        lastActiveTab: data.lastActiveTab || null
      });
    });
    return true; // asynchronous response
  }

  if (request.type === 'CHECK_APPROVAL') {
    (async () => {
      const storage = await getStorage(['serverUrl', 'authToken']);
      const sUrl = storage.serverUrl || DEFAULT_SERVER_URL;
      const headers = { 'Content-Type': 'application/json' };
      if (storage.authToken) {
        headers['Authorization'] = `Bearer ${storage.authToken}`;
      }
      try {
        const res = await fetch(`${sUrl}/api/v1/auth/status`, {
          method: 'GET',
          headers,
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          const approvalStatus = data.approvalStatus || (data.authenticated ? 'approved' : 'unknown');
          await setStorage({
            approvalStatus,
            organizationId: data.organizationId || null
          });
          sendResponse({ success: true, approvalStatus, authenticated: data.authenticated });
        } else {
          sendResponse({ success: false, error: `Server responded with ${res.status}` });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (request.type === 'SYNC_NOW') {
    captureTick('manual_sync')
      .then(() => syncEvents())
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'CAPTURE_TICK') {
    captureTick(request.reason || 'manual')
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'FLUSH_AND_RESET') {
    flushAllEvents()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});
