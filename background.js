// TabNap - Background Worker
// Periodically checks tab idle time and snoozes them.

const DEFAULT_TIMEOUT_MINS = 30;
const CHECK_INTERVAL_MINS = 1;

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ 
      timeout: DEFAULT_TIMEOUT_MINS, 
      whitelist: [] 
    });
  }

  if (details.reason === 'update') {
    // Extension reloaded — any open nap.html tabs got invalidated by Chrome.
    // Re-navigate them back to nap.html using the persistent registry.
    await recoverSleepingTabs();
  }

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

// Persistent registry of sleeping tabs — survives extension reloads and browser restarts.
// Key: tabId (string), Value: { originalUrl, title, groupId }

async function getSleepingTabs() {
  const { sleepingTabs = {} } = await chrome.storage.local.get('sleepingTabs');
  return sleepingTabs;
}

async function setSleepingTabs(sleepingTabs) {
  await chrome.storage.local.set({ sleepingTabs });
}

// On extension update, Chrome invalidates all open extension pages.
// Find any tabs that were sleeping and got converted, re-navigate them back.
async function recoverSleepingTabs() {
  const sleepingTabs = await getSleepingTabs();
  if (Object.keys(sleepingTabs).length === 0) return;

  const extensionUrl = chrome.runtime.getURL('nap.html');
  const updatedRegistry = { ...sleepingTabs };

  for (const [tabId, data] of Object.entries(sleepingTabs)) {
    try {
      const tab = await chrome.tabs.get(parseInt(tabId));
      if (!tab.url.startsWith(extensionUrl)) {
        // Tab was converted — put it back to sleep
        const napUrl = `${extensionUrl}?url=${encodeURIComponent(data.originalUrl)}&title=${encodeURIComponent(data.title)}`;
        await chrome.tabs.update(tab.id, { url: napUrl });
      }
    } catch {
      // Tab no longer exists, clean up the entry
      delete updatedRegistry[tabId];
    }
  }

  await setSleepingTabs(updatedRegistry);
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

// When a sleeping tab navigates away from nap.html, it's awake — remove from registry
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;

  const extensionUrl = chrome.runtime.getURL('nap.html');
  const key = String(tabId);
  const sleepingTabs = await getSleepingTabs();

  if (key in sleepingTabs && !changeInfo.url.startsWith(extensionUrl)) {
    delete sleepingTabs[key];
    await setSleepingTabs(sleepingTabs);
  }
});

// Clean up both maps when a tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const key = String(tabId);

  const tabActivity = await getTabActivity();
  if (key in tabActivity) {
    delete tabActivity[key];
    await setTabActivity(tabActivity);
  }

  const sleepingTabs = await getSleepingTabs();
  if (key in sleepingTabs) {
    delete sleepingTabs[key];
    await setSleepingTabs(sleepingTabs);
  }
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
    const sleepingTabs = await getSleepingTabs();
    let activityDirty = false;
    let sleepDirty = false;

    for (const tab of tabs) {
      const tabId = String(tab.id);

      // 0. Skip if already napping or discarded
      if (tab.url.startsWith(extensionUrl) || tab.discarded) continue;

      // 1. Skip if on whitelist
      if (whitelist.some(url => tab.url && tab.url.includes(url))) continue;

      const activity = tabActivity[tabId];
      
      // If we have no activity data, assume it's just been opened and start tracking
      if (!activity) {
        tabActivity[tabId] = { timestamp: now, isDirty: false };
        activityDirty = true;
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
          // Register before navigating so the entry exists if anything goes wrong
          sleepingTabs[tabId] = { originalUrl: tab.url, title: tab.title, groupId: tab.groupId };
          sleepDirty = true;

          await chrome.tabs.update(tab.id, { url: napUrl });

          delete tabActivity[tabId];
          activityDirty = true;

          // Small delay to allow the redirect to start before discarding
          setTimeout(() => {
            chrome.tabs.discard(tab.id).catch(() => {});
          }, 1000);
        } catch (e) {
          // Undo the registry entry if the redirect failed
          delete sleepingTabs[tabId];
          console.error(`[TabNap] Failed to snooze tab ${tab.id}:`, e);
        }
      }
    }

    if (activityDirty) await setTabActivity(tabActivity);
    if (sleepDirty) await setSleepingTabs(sleepingTabs);
  }
});
