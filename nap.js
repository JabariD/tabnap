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
    
    // Set favicon
    const faviconImg = document.getElementById('favicon');
    const domain = new URL(originalUrl).hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    
    faviconImg.onload = () => {
        faviconImg.style.display = 'inline-block';
        faviconImg.style.opacity = '1';
    };
    faviconImg.style.opacity = '0';
    faviconImg.src = faviconUrl;

    // Update tab favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = faviconUrl;
    document.head.appendChild(link);
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
