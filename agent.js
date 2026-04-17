import { record } from 'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.11/+esm';

const events = [];
const eventCountEl = document.getElementById('event-count');
const stopButtonEl = document.getElementById('stop-btn');
const originalFetch = window.fetch.bind(window);

function addEvent(event) {
  events.push(event);
  eventCountEl.textContent = String(events.length);
}

addEvent({
  type: 51,
  timestamp: Date.now(),
  data: {
    url: location.href,
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
  },
});

window.fetch = async (resource, config) => {
  const url = resource instanceof Request ? resource.url : String(resource);
  const method = resource instanceof Request ? resource.method : config?.method || 'GET';
 
  if (url.includes('/capture')) {
    return originalFetch(resource, config);
  }

  try {
    const response = await originalFetch(resource, config);
 
    addEvent({
      type: 50,
      timestamp: Date.now(),
      data: {
        type: 'FETCH',
        url,
        method,
        status: response.status,
      },
    });
 
    return response;
  } catch (error) {
    addEvent({
      type: 50,
      timestamp: Date.now(),
      data: {
        type: 'FETCH',
        url,
        method,
        error: error instanceof Error ? error.message : String(error),
      },
    });
 
    throw error;
  }
}

const stopRecording = record({
  emit(event) {
    addEvent(event);
  },
});
 
stopButtonEl.addEventListener('click', async () => {
  stopRecording();
  window.fetch = originalFetch;
 
  stopButtonEl.disabled = true;
  stopButtonEl.textContent = 'Sending...';
 
  const response = await originalFetch('/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(events),
  });
 
  const data = await response.json();
  stopButtonEl.textContent = data.message;
});