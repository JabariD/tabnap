// TabNap - Background Worker
// Periodically checks tab idle time and snoozes them.

const DEFAULT_TIMEOUT_MINS = 30;
const CHECK_INTERVAL_MINS = 1;

// Initialize on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      timeout: DEFAULT_TIMEOUT_MINS,
      whitelist: []
    });
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

// Persistent list of grouped tab URLs that TabNap put to sleep.
//
// Chrome's saved tab groups restore real URLs correctly, but on this machine
// they eagerly load every tab in the reopened group. This list lets us put only
// tabs that were previously sleeping back to sleep after Chrome's forced load.
// Keying by URL is deliberately simple and restart-safe. We only use it for
// grouped tabs to avoid surprising standalone tabs opened later with the same URL.
async function getSleepingGroupUrls() {
  const { sleepingGroupUrls = [] } = await chrome.storage.local.get('sleepingGroupUrls');
  return sleepingGroupUrls;
}

async function addSleepingGroupUrl(url) {
  if (!url) return;
  const urls = await getSleepingGroupUrls();
  if (!urls.includes(url)) {
    urls.push(url);
    await chrome.storage.local.set({ sleepingGroupUrls: urls });
  }
}

async function removeSleepingGroupUrl(url) {
  if (!url) return;
  const urls = await getSleepingGroupUrls();
  const nextUrls = urls.filter((storedUrl) => storedUrl !== url);
  if (nextUrls.length !== urls.length) {
    await chrome.storage.local.set({ sleepingGroupUrls: nextUrls });
  }
}

async function markSleepingTitle(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (!document.title.startsWith('💤')) {
          document.title = '💤 ' + document.title;
        }
      },
    });
  } catch (e) {
    // Page doesn't allow injection — not fatal, snooze anyway.
  }
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

// When the user activates a sleeping grouped tab, treat it as awake. This keeps
// TabNap from immediately re-sleeping the tab the user intentionally opened.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await removeSleepingGroupUrl(tab.url);
  } catch (e) {
    // Tab disappeared or URL is inaccessible — ignore.
  }
});

// Re-sleep grouped tabs after Chrome eagerly reloads a saved tab group.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (tab.active || tab.discarded) return;
  if (tab.groupId === -1) return;

  const sleepingGroupUrls = await getSleepingGroupUrls();
  if (!sleepingGroupUrls.includes(tab.url)) return;

  await markSleepingTitle(tabId);
  chrome.tabs.discard(tabId).catch(() => {});
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
    const tabActivity = await getTabActivity();
    let dirty = false;

    for (const tab of tabs) {
      const tabId = String(tab.id);

      // 0. Skip if already discarded (asleep)
      if (tab.discarded) continue;

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

        // Visual marker: prepend 💤 to the tab's title before discarding. This
        // touches only document.title, never the URL, so saved tab groups and
        // session restore stay intact. The discarded tab keeps this title while
        // asleep (and the saved group stores it), then reverts to the real title
        // when clicked and reloaded. Best-effort — fails silently on pages where
        // scripts can't run (chrome://, extension, Web Store), which just stay
        // natively dimmed.
        await markSleepingTitle(tab.id);

        // Native discard: unloads the tab from memory but keeps its real URL,
        // title, favicon, and group membership. This is what lets sleeping tabs
        // survive a Chrome restart / saved tab group reopen — the group stores
        // the real URL, not an extension page that Chrome refuses to restore.
        try {
          if (tab.groupId !== -1) {
            await addSleepingGroupUrl(tab.url);
          }
          await chrome.tabs.discard(tab.id);
          delete tabActivity[tabId];
          dirty = true;
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
