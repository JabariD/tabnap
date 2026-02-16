// TabNap - Content Script
// Monitors user activity and unsaved form data.

let isDirty = false;
let lastHeartbeat = 0;
const HEARTBEAT_THROTTLE = 10000; // Only notify background every 10 seconds

function checkDirtyState() {
  // Check if any input or textarea has a value that isn't empty or default
  // This is a simple heuristic for "unsaved data"
  const inputs = document.querySelectorAll('input:not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]');
  for (let input of inputs) {
    // If it's a checkbox/radio, check if it changed (harder to track without initial state, 
    // but usually text is the concern)
    if (input.tagName === 'INPUT' && (input.type === 'checkbox' || input.type === 'radio')) {
      // For simplicity, we just look for text changes
      continue;
    }
    
    const val = input.tagName === 'DIV' ? input.innerText : input.value;
    if (val && val.length > 0 && val !== input.defaultValue) {
      return true;
    }
  }
  return false;
}

function sendHeartbeat() {
  const now = Date.now();
  if (now - lastHeartbeat < HEARTBEAT_THROTTLE) return;

  isDirty = checkDirtyState();
  
  chrome.runtime.sendMessage({
    type: 'HEARTBEAT',
    isDirty: isDirty
  }).catch(() => {
    // Port might be closed if extension updated/reloaded
  });
  
  lastHeartbeat = now;
}

// Monitor events that signify activity
['mousemove', 'keydown', 'scroll', 'click'].forEach(eventType => {
  window.addEventListener(eventType, sendHeartbeat, { passive: true });
});

// Initial heartbeat
setTimeout(sendHeartbeat, 1000);
