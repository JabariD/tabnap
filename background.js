// TabNap - Background Worker
// Periodically checks tab idle time and snoozes them.

const DEFAULT_TIMEOUT_MINS = 30;
const CHECK_INTERVAL_MINS = 1;

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ 
    timeout: DEFAULT_TIMEOUT_MINS, 
    whitelist: [] 
  });
  setupAlarm();
});

// Re-register alarm on browser startup (alarms don't survive browser restarts)
chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
});

// Setup the periodic check alarm
function setupAlarm() {
  // Clear any existing alarm before creating to avoid duplicates
  chrome.alarms.clear('checkTabs', () => {
    chrome.alarms.create('checkTabs', { periodInMinutes: CHECK_INTERVAL_MINS });
  });
}

// Tab activity is stored in chrome.storage.session so it survives service worker
// restarts (which happen every ~30s of inactivity in MV3) but clears on browser close.
// Key: tabId (string), Value: { timestamp, isDirty }

async function getTabActivity() {
  const { tabActivity = {} } = await chrome.storage.session.get('tabActivity');
  return tabActivity;
}

async function setTabActivity(tabActivity) {
  await chrome.storage.session.set({ tabActivity });
}

// Update activity when user interacts with a tab
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'HEARTBEAT' && sender.tab) {
    const tabId = String(sender.tab.id);
    getTabActivity().then(tabActivity => {
      tabActivity[tabId] = {
        timestamp: Date.now(),
        isDirty: message.isDirty // If user has unsaved data
      };
      setTabActivity(tabActivity);
    });
  }
});

// Clean up activity map when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const key = String(tabId);
  getTabActivity().then(tabActivity => {
    if (key in tabActivity) {
      delete tabActivity[key];
      setTabActivity(tabActivity);
    }
  });
});

// Alarm handler: checks all tabs
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkTabs') {
    const settings = await chrome.storage.local.get(['timeout', 'whitelist']);
    const timeoutMs = (settings.timeout || DEFAULT_TIMEOUT_MINS) * 60 * 1000;
    const whitelist = settings.whitelist || [];

    const tabs = await chrome.tabs.query({ 
      active: false,    // Never snooze the current tab
      pinned: false,    // (Optional) ignore pinned tabs
      audible: false,   // Never snooze music/media
    });

    const now = Date.now();
    const extensionUrl = chrome.runtime.getURL('nap.html');
    const tabActivity = await getTabActivity();
    let dirty = false;

    for (const tab of tabs) {
      const tabId = String(tab.id);

      // 0. Skip if already napping
      if (tab.url.startsWith(extensionUrl) || tab.discarded) continue;

      // 1. Skip if on whitelist
      if (whitelist.some(url => tab.url && tab.url.includes(url))) continue;

      const activity = tabActivity[tabId];
      
      // If we have no activity data, assume it's just been opened and start tracking
      if (!activity) {
        tabActivity[tabId] = { timestamp: now, isDirty: false };
        dirty = true;
        continue;
      }

      // 2. Skip if it has unsaved data (Dirty flag from content script)
      if (activity.isDirty) continue;

      // 3. Skip if it's currently loading
      if (tab.status === 'loading') continue;

      // 4. Calculate idle time
      const idleTime = now - activity.timestamp;
      if (idleTime > timeoutMs) {
        console.log(`[TabNap] Snoozing tab ${tab.id}: ${tab.title}`);
        
        const napUrl = `${extensionUrl}?url=${encodeURIComponent(tab.url)}&title=${encodeURIComponent(tab.title)}`;
        
        try {
          // Redirect to the napping placeholder
          await chrome.tabs.update(tab.id, { url: napUrl });
          
          // Remove from tracking — the nap.html tab will be a fresh entry if reactivated
          delete tabActivity[tabId];
          dirty = true;

          // Small delay to allow the redirect to start before discarding
          // This ensures the placeholder is what's in memory
          setTimeout(() => {
            chrome.tabs.discard(tab.id).catch(() => {});
          }, 1000);
        } catch (e) {
          console.error(`[TabNap] Failed to snooze tab ${tab.id}:`, e);
        }
      }
    }

    if (dirty) {
      await setTabActivity(tabActivity);
    }
  }
});
