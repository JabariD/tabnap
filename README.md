# 💤 TabNap

A minimal, transparent, and smart browser extension that snoozes inactive tabs to reclaim memory.

## Features

- **Smart Snoozing:** Only snoozes tabs after X minutes of inactivity.
- **Data Protection:** Automatically detects unsaved text in forms/inputs and prevents snoozing.
- **Media Aware:** Won't snooze tabs playing music or video.
- **Visual Feedback:** Prepends a 💤 emoji to snoozed tab titles so you know exactly which tabs are napping.
- **Native Efficiency:** Uses the Chrome `tabs.discard` API to reduce tab memory usage by ~95% while keeping them in your tab strip.

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
