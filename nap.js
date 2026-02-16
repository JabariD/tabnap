// nap.js - Handles waking up the tab

// Get URL and Title from query parameters
const params = new URLSearchParams(window.location.search);
const originalUrl = params.get('url');
const originalTitle = params.get('title');

if (originalTitle) {
    document.title = '💤 ' + originalTitle;
    document.getElementById('title').textContent = originalTitle;
}

if (originalUrl) {
    document.getElementById('url').textContent = originalUrl;
}

// Wake up on click
document.body.addEventListener('click', () => {
    if (originalUrl) {
        window.location.replace(originalUrl);
    }
});

// Also wake up if user hits Enter or Space
window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        if (originalUrl) {
            window.location.replace(originalUrl);
        }
    }
});
