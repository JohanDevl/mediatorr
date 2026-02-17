document.addEventListener('DOMContentLoaded', async () => {
  await loadStats();
  await loadRecentActivity();

  const btnScan = document.getElementById('btn-scan');
  if (btnScan) {
    btnScan.addEventListener('click', triggerScan);
  }

  SSE.on('scan:progress', updateProgress);
  SSE.on('scan:complete', onScanComplete);
});

async function loadStats() {
  try {
    const stats = await api('/stats');

    const filmsStat = document.querySelector('#stat-films .stat-value');
    const seriesStat = document.querySelector('#stat-series .stat-value');
    const musiquesStat = document.querySelector('#stat-musiques .stat-value');
    const sizeStat = document.querySelector('#stat-size .stat-value');

    if (filmsStat) filmsStat.textContent = stats.films?.count ?? 0;
    if (seriesStat) seriesStat.textContent = stats.series?.count ?? 0;
    if (musiquesStat) musiquesStat.textContent = stats.musiques?.count ?? 0;
    if (sizeStat) sizeStat.textContent = formatSize(stats.totalSize || 0);

    const lastScanContent = document.getElementById('last-scan-content');
    if (lastScanContent) {
      if (stats.lastScan) {
        const lastDate = formatDate(stats.lastScan.lastScan);
        const duration = stats.lastScan.duration || '-';
        const filmsCount = stats.lastScan.films || 0;
        const seriesCount = stats.lastScan.series || 0;
        const musiquesCount = stats.lastScan.musiques || 0;

        lastScanContent.innerHTML = `
          <div class="card-content">
            <p>Date: <strong>${escapeHtml(lastDate)}</strong></p>
            <p>Duration: <strong>${escapeHtml(duration)}</strong></p>
            <p>Films: <strong>${filmsCount}</strong>, Series: <strong>${seriesCount}</strong>, Musiques: <strong>${musiquesCount}</strong></p>
          </div>
        `;
      } else {
        lastScanContent.innerHTML = '<div class="card-content">Aucun scan</div>';
      }
    }
  } catch (err) {
    console.error('Error loading stats:', err);
    showToast('Erreur lors du chargement des stats', 'error');
  }
}

async function loadRecentActivity() {
  try {
    const recentActivity = document.getElementById('recent-activity');
    if (!recentActivity) return;

    const [filmsResult, seriesResult, musiquesResult] = await Promise.all([
      api('/media/films?sort=date_desc&perPage=5').catch(() => ({ items: [] })),
      api('/media/series?sort=date_desc&perPage=5').catch(() => ({ items: [] })),
      api('/media/musiques?sort=date_desc&perPage=5').catch(() => ({ items: [] }))
    ]);

    const allItems = [
      ...(filmsResult.items || []).map(item => ({ ...item, type: 'films', icon: '🎬' })),
      ...(seriesResult.items || []).map(item => ({ ...item, type: 'series', icon: '📺' })),
      ...(musiquesResult.items || []).map(item => ({ ...item, type: 'musiques', icon: '♪' }))
    ];

    allItems.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const recentItems = allItems.slice(0, 10);

    if (recentItems.length === 0) {
      recentActivity.innerHTML = '<div class="empty-state-message">Aucune activite recente</div>';
      return;
    }

    recentActivity.innerHTML = recentItems.map(item => `
      <div class="flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-3" style="flex: 1;">
          <span style="font-size: 20px;">${item.icon}</span>
          <div>
            <div style="font-weight: 500; color: var(--text-primary);">${escapeHtml(item.name)}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${formatDate(item.modifiedAt)}</div>
          </div>
        </div>
        <span class="badge badge-info">${escapeHtml(item.type)}</span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading recent activity:', err);
    const recentActivity = document.getElementById('recent-activity');
    if (recentActivity) {
      recentActivity.innerHTML = '<div class="empty-state-message">Erreur lors du chargement de l\'activite</div>';
    }
  }
}

async function triggerScan() {
  try {
    const btnScan = document.getElementById('btn-scan');
    if (btnScan) {
      btnScan.disabled = true;
    }

    await api('/scan', { method: 'POST' });
    showToast('Scan lance', 'success');

    if (btnScan) {
      btnScan.disabled = false;
    }
  } catch (err) {
    console.error('Error triggering scan:', err);
    showToast(err.message || 'Erreur lors du lancement du scan', 'error');
    const btnScan = document.getElementById('btn-scan');
    if (btnScan) {
      btnScan.disabled = false;
    }
  }
}

function updateProgress(data) {
  const statusContent = document.getElementById('status-content');
  if (!statusContent) return;

  if (data.current && data.total) {
    const percent = Math.round((data.current / data.total) * 100);
    statusContent.innerHTML = `
      <div class="card-content">
        <p style="margin-bottom: 8px;">Processing: <strong>${escapeHtml(data.current)}/${escapeHtml(data.total)}</strong> (${percent}%)</p>
        <div style="width: 100%; height: 8px; background-color: var(--border); border-radius: 4px; overflow: hidden;">
          <div style="width: ${percent}%; height: 100%; background-color: var(--accent); transition: width 200ms ease;"></div>
        </div>
      </div>
    `;
  }
}

function onScanComplete(data) {
  loadStats();
  loadRecentActivity();
  showToast('Scan termine', 'success');

  const statusContent = document.getElementById('status-content');
  if (statusContent) {
    const stats = data.stats || {};
    statusContent.innerHTML = `
      <div class="card-content">
        <span class="badge badge-success">Complete</span>
        <p style="margin-top: 8px; font-size: 12px; color: var(--text-secondary);">
          ${stats.films || 0} films, ${stats.series || 0} series, ${stats.musiques || 0} musiques
        </p>
      </div>
    `;
  }
}
