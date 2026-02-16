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

// Setup the periodic check alarm
function setupAlarm() {
  chrome.alarms.create('checkTabs', { periodInMinutes: CHECK_INTERVAL_MINS });
}

// Map to track the last activity time for each tab
// Key: tabId, Value: timestamp
let tabActivity = {};

// Update activity when user interacts with a tab
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'HEARTBEAT' && sender.tab) {
    tabActivity[sender.tab.id] = {
      timestamp: Date.now(),
      isDirty: message.isDirty // If user has unsaved data
    };
  }
});

// Clean up activity map when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabActivity[tabId];
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

    for (const tab of tabs) {
      // 0. Skip if already napping
      if (tab.url.startsWith(extensionUrl) || tab.discarded) continue;

      // 1. Skip if on whitelist
      if (whitelist.some(url => tab.url && tab.url.includes(url))) continue;

      const activity = tabActivity[tab.id];
      
      // If we have no activity data, assume it's just been opened and start tracking
      if (!activity) {
        tabActivity[tab.id] = { timestamp: now, isDirty: false };
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
  }
});
