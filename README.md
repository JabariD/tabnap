# 💤 TabNap

A minimal, transparent, and smart browser extension that snoozes inactive tabs to reclaim memory.

## Features

- **Smart Snoozing:** Only snoozes tabs after X minutes of inactivity.
- **Data Protection:** Automatically detects unsaved text in forms/inputs and prevents snoozing.
- **Media Aware:** Won't snooze tabs playing music or video.
- **Native Efficiency:** Uses the Chrome `tabs.discard` API to reduce tab memory usage by ~95% while keeping tabs in your tab strip.
- **Visual Feedback:** Prepends a 💤 emoji to snoozed tab titles so you can spot sleeping tabs at a glance (reverts to the real title when you click in).
- **Saved-Group Safe:** Snoozed tabs keep their real URL and group membership. If Chrome eagerly reloads a saved tab group, TabNap recognizes previously sleeping grouped URLs and puts those background tabs back to sleep.
  - Caveat: grouped sleep tracking is URL-based. If two grouped tabs have the exact same URL, waking one removes that URL from the sleep list for both.

## Installation (Developer Mode)

1. Clone this repository or download the source.
2. Open Chrome/Brave/Edge and navigate to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `tabnap` folder.

## Configuration

Click the TabNap icon in your toolbar to set your preferred inactivity timeout (default is 30 minutes).

## Technical Details

- **Manifest V3** compliant.
- **Lightweight:** No heavy libraries, just pure JavaScript.
- **Privacy:** All logic runs locally; no data is ever sent to a server.
