// TabNap - Popup Script
const timeoutInput = document.getElementById('timeout');
const saveBtn = document.getElementById('save');
const statusDiv = document.getElementById('status');

// Load current settings
chrome.storage.local.get(['timeout'], (result) => {
  if (result.timeout) {
    timeoutInput.value = result.timeout;
  } else {
    timeoutInput.value = 30;
  }
});

// Save settings
saveBtn.addEventListener('click', () => {
  const timeout = parseInt(timeoutInput.value, 10);
  
  if (isNaN(timeout) || timeout < 1) {
    showStatus('Please enter a valid number.', 'error');
    return;
  }

  chrome.storage.local.set({ timeout: timeout }, () => {
    showStatus('Settings saved!');
    
    // Notify background to update any running timers (optional but good practice)
    // In our case the alarm just checks storage on every tick.
  });
});

function showStatus(msg, type = 'success') {
  statusDiv.textContent = msg;
  statusDiv.className = type;
  setTimeout(() => {
    statusDiv.textContent = '';
    statusDiv.className = '';
  }, 2000);
}
