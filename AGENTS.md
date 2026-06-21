# AGENTS.md - Instructions for AI Coding Agents

You are working on **TabNap**, a Chrome extension that freezes inactive tabs to save memory and CPU.

## Project Overview
- **Tech Stack**: Chrome Extension Manifest V3, JavaScript, HTML, CSS.
- **Core Logic**:
  - `background.js`: Monitors tab activity and snoozes idle tabs via the native `chrome.tabs.discard` API.
  - `popup.html` / `popup.js`: User interface for settings.
  - `content.js`: Injected script for interaction detection.
- **Why this approach exists**: The user keeps Chrome startup clean and relies on Chrome's saved tab groups as the persistence layer. The expected behavior is: Chrome opens blank; when a saved group is reopened, its sleeping tabs come back in the same group/position, still sleeping. The old `nap.html?url=...` approach broke that because saved groups stored the extension URL instead of the real URL, and Chrome restored those extension pages as blank New Tabs.
- **Sleeping a tab MUST use `chrome.tabs.discard`, never navigation to an extension page.** Discard keeps the tab's real URL and group membership, so saved tab groups and session restore bring sleeping tabs back intact. Navigating a tab to an extension page (e.g. an old `nap.html`) hides the real URL inside a `chrome-extension://` URL that Chrome refuses to restore — on group/session reopen those tabs become blank New Tabs and the original URL is lost. Do not reintroduce that pattern.
- **Re-sleep on saved-group reopen**: Chrome eagerly loads every tab when a saved group is reopened. To restore the desired end state, `background.js` stores URLs of grouped tabs that TabNap put to sleep in `sleepingGroupUrls`; when Chrome reloads one of those URLs in a background grouped tab, TabNap re-applies the `💤` title marker and `discard`s it again. Do not remove this; without it, reopened groups stay fully loaded.
- **Known caveat**: `sleepingGroupUrls` is URL-based. If multiple grouped tabs have the exact same URL, waking one removes that URL from the sleep list for all of them. This is the deliberate simple tradeoff that avoids brittle tab-id/session-id restoration machinery.

## Code Conventions
- Use modern JavaScript (ES6+).
- Use `chrome.storage.local` for settings, `chrome.storage.session` for transient tab-activity state.

## Build & Release
- Manifest is in `manifest.json`.
- Increment the `version` field in `manifest.json` before creating a new tag.
- Use Git tags for releases (e.g., `v1.2`).
- Use the `gh` CLI to create formal GitHub releases with notes.

## Boundaries
- Do not add external dependencies unless absolutely necessary.
- Do not snooze tabs by navigating them to an extension page. Use `chrome.tabs.discard` only (see Project Overview for why).
