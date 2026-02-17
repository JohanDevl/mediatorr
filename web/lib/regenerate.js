const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const emitter = require('./events');

const DEST_DIR = '/data/torrent';
const EXTENSIONS = ['.torrent', '.nfo', '.txt', '.prez.txt', '.srcinfo', '.source.nfo'];

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

function isRunning() {
  return activeProcess !== null;
}

module.exports = {
  deleteArtifacts,
  triggerScan,
  isRunning,
};
