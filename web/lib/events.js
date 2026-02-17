const EventEmitter = require('events');
const fs = require('fs');

const STATUS_FILE = '/data/status.json';

// Create singleton emitter
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

let lastStatus = null;
let watchFile = null;

function startWatching() {
  // Use fs.watchFile (polling) since /data may be a Docker volume
  watchFile = fs.watchFile(STATUS_FILE, { interval: 1000 }, () => {
    try {
      const content = fs.readFileSync(STATUS_FILE, 'utf8');
      const status = JSON.parse(content);
      // Only emit if status actually changed
      if (JSON.stringify(status) !== JSON.stringify(lastStatus)) {
        lastStatus = status;
        if (status.state === 'running') {
          emitter.emit('scan:progress', status);
        } else if (status.state === 'idle') {
          emitter.emit('scan:complete', status);
        }
      }
    } catch {
      // Silently ignore parse/read errors
    }
  });
}

function getLastStatus() {
  if (lastStatus) return lastStatus;
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return { state: 'idle' };
  }
}

function stopWatching() {
  if (watchFile) {
    fs.unwatchFile(STATUS_FILE);
    watchFile = null;
  }
}

// Start watching on module load
startWatching();

module.exports = emitter;
module.exports.getLastStatus = getLastStatus;
module.exports.stopWatching = stopWatching;
