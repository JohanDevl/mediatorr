document.addEventListener('DOMContentLoaded', () => {
  const viewer = document.getElementById('log-viewer');
  const logCount = document.getElementById('log-count');
  let autoScroll = true;
  let currentFilter = 'all';
  let logs = [];
  const MAX_LOGS = 1000;

  // Clear button
  document.getElementById('btn-clear').addEventListener('click', () => {
    logs = [];
    renderLogs();
  });

  // Auto-scroll toggle
  const autoScrollBtn = document.getElementById('btn-autoscroll');
  autoScrollBtn.addEventListener('click', () => {
    autoScroll = !autoScroll;
    autoScrollBtn.classList.toggle('active', autoScroll);
    if (autoScroll) scrollToBottom();
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.level;
      renderLogs();
    });
  });

  // Listen for SSE events
  if (window.SSE) {
    SSE.on('log', (data) => {
      addLog(data);
    });

    SSE.on('scan:progress', (data) => {
      addLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: data.currentItem
          ? `[${data.mediaType || ''}] Processing ${data.current}/${data.total}: ${data.currentItem}`
          : 'Scan in progress...'
      });
    });

    SSE.on('scan:complete', (data) => {
      const statsMsg = data.stats
        ? `Processed: ${data.stats.processed}, Skipped: ${data.stats.skipped}`
        : '';
      addLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Scan complete. ${statsMsg}`
      });
    });
  }

  function addLog(entry) {
    if (!entry.timestamp) entry.timestamp = new Date().toISOString();
    if (!entry.level) entry.level = 'info';
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.shift();
    renderLogs();
  }

  function renderLogs() {
    const filtered = currentFilter === 'all' ? logs : logs.filter(l => l.level === currentFilter);
    logCount.textContent = `${filtered.length} lignes`;

    if (!filtered.length) {
      viewer.innerHTML = '<div class="empty-state" style="min-height: auto; padding: var(--spacing-lg); gap: 0;">Aucun log</div>';
      return;
    }

    viewer.innerHTML = filtered
      .map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('fr-FR');
        const levelClass =
          log.level === 'error'
            ? 'log-error'
            : log.level === 'warning'
              ? 'log-warning'
              : 'log-info';
        return `<div class="log-line ${levelClass}"><span class="log-time">${escapeHtml(time)}</span> <span class="log-level">[${log.level.toUpperCase()}]</span> <span class="log-message">${escapeHtml(log.message)}</span></div>`;
      })
      .join('');

    if (autoScroll) scrollToBottom();
  }

  function scrollToBottom() {
    viewer.scrollTop = viewer.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderLogs();
});
