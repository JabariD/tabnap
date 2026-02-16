# AGENTS.md - Instructions for AI Coding Agents

You are working on **TabNap**, a Chrome extension that freezes inactive tabs to save memory and CPU.

## Project Overview
- **Tech Stack**: Chrome Extension Manifest V3, JavaScript, HTML, CSS.
- **Core Logic**:
  - `background.js`: Monitors tab activity and manages timeouts.
  - `nap.html` / `nap.js`: The "sleeping" page shown when a tab is frozen.
  - `popup.html` / `popup.js`: User interface for settings.
  - `content.js`: Injected script for interaction detection.

## Code Conventions
- Use modern JavaScript (ES6+).
- Maintain a dark, minimalist aesthetic for the nap page.
- Use `chrome.storage.local` for settings and state.
- Ensure all nap page interactions (click/key) wake the tab immediately using `window.location.replace`.

## Favicon Implementation
- Use the Google Favicon service for high-quality icons on the nap page: `https://www.google.com/s2/favicons?domain={hostname}&sz=128`.
- Icons should have `16px` border-radius and a subtle shadow on the nap page.

## Build & Release
- Manifest is in `manifest.json`.
- Increment the `version` field in `manifest.json` before creating a new tag.
- Use Git tags for releases (e.g., `v1.2`).
- Use the `gh` CLI to create formal GitHub releases with notes.

## Boundaries
- Do not add external dependencies unless absolutely necessary.
- Do not modify the original URL query parameter logic in `nap.js`, as it's critical for waking tabs.
