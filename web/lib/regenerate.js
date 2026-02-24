const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const emitter = require('./events');

const DEST_DIR = '/data/torrent';
const CACHE_DIR_TMDB = '/data/cache_tmdb';
const CACHE_DIR_ITUNES = '/data/cache_itunes';
const EXTENSIONS = ['.torrent', '.nfo', '.txt', '.prez.txt', '.srcinfo', '.source.nfo'];
const METADATA_EXTENSIONS = ['.txt', '.prez.txt'];

let activeProcess = null;

function deleteArtifacts(type, name) {
  const itemDir = path.join(DEST_DIR, type, name);
  let deleted = 0;

  try {
    for (const ext of EXTENSIONS) {
      const filePath = path.join(itemDir, `${name}${ext}`);
      try {
        fs.unlinkSync(filePath);
        deleted++;
      } catch {
        // File doesn't exist, skip
      }
    }
  } catch {
    // Directory doesn't exist or other error
  }

  return { deleted };
}

function triggerScan() {
  if (activeProcess) {
    return { error: 'Scan already in progress' };
  }

  try {
    activeProcess = spawn('node', ['/app/scene-maker.js'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    activeProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        emitter.emit('scan:log', { type: 'stdout', message: output });
      }
    });

    activeProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        emitter.emit('scan:log', { type: 'stderr', message: output });
      }
    });

    activeProcess.on('close', (code) => {
      activeProcess = null;
      emitter.emit('scan:complete', {
        state: 'idle',
        exitCode: code,
        timestamp: new Date().toISOString(),
      });
    });

    return { status: 'started' };
  } catch (err) {
    activeProcess = null;
    return { error: `Failed to start scan: ${err.message}` };
  }
}

function deleteMetadataArtifacts(type, name) {
  const itemDir = path.join(DEST_DIR, type, name);
  let deleted = 0;

  // Delete TMDb-dependent artifacts (.txt, .prez.txt)
  for (const ext of METADATA_EXTENSIONS) {
    const filePath = path.join(itemDir, `${name}${ext}`);
    try { fs.unlinkSync(filePath); deleted++; } catch {}
  }

  // Delete cache file
  const safeName = name.replace(/\s+/g, '.').toLowerCase();
  if (type === 'films') {
    const cacheFile = path.join(CACHE_DIR_TMDB, `movie_${safeName}.json`);
    try { fs.unlinkSync(cacheFile); deleted++; } catch {}
  } else if (type === 'series') {
    const cacheFile = path.join(CACHE_DIR_TMDB, `tv_${safeName}.json`);
    try { fs.unlinkSync(cacheFile); deleted++; } catch {}
  } else if (type === 'musiques') {
    const cacheFile = path.join(CACHE_DIR_ITUNES, `${safeName}.json`);
    try { fs.unlinkSync(cacheFile); deleted++; } catch {}
  }

  return { deleted };
}

function stopScan() {
  if (!activeProcess) {
    return { error: 'No scan in progress' };
  }

  try {
    const pid = activeProcess.pid;
    activeProcess.kill('SIGTERM');
    // Force kill after 5s if still alive
    setTimeout(() => {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }, 5000);
    // Ensure status file reflects stopped state
    try {
      fs.writeFileSync('/data/status.json', JSON.stringify({
        state: 'idle',
        lastScan: new Date().toISOString(),
        stoppedManually: true
      }));
    } catch {}
    return { status: 'stopped' };
  } catch (err) {
    return { error: `Failed to stop scan: ${err.message}` };
  }
}

function isRunning() {
  return activeProcess !== null;
}

module.exports = {
  deleteArtifacts,
  deleteMetadataArtifacts,
  triggerScan,
  stopScan,
  isRunning,
};
