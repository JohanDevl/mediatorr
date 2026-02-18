const fs = require('fs');
const path = require('path');
const db = require('../../db');

const TORRENT_BASE = '/data/torrent';
const CACHE_DIR_TMDB = '/data/cache_tmdb';
const CACHE_DIR_ITUNES = '/data/cache_itunes';
const STATUS_FILE = '/data/status.json';

/**
 * Convert name to safe cache key format (dots, lowercase)
 */
function toSafeName(name) {
  return name.replace(/\s+/g, '.').toLowerCase();
}

/**
 * List media items of a given type with filtering, sorting, and pagination
 */
function listMedia(type, options = {}) {
  const { search = '', sort = 'name_asc', page = 1, perPage = 24 } = options;
  const typeDir = path.join(TORRENT_BASE, type);

  if (!fs.existsSync(typeDir)) {
    return { items: [], total: 0, page, totalPages: 0 };
  }

  let items = [];
  const dirs = fs.readdirSync(typeDir);

  for (const dir of dirs) {
    const fullPath = path.join(typeDir, dir);
    const stat = fs.statSync(fullPath);

    if (!stat.isDirectory()) continue;

    // Filter by search
    if (search && !dir.toLowerCase().includes(search.toLowerCase())) {
      continue;
    }

    // Check which files exist
    const files = {
      torrent: fs.existsSync(path.join(fullPath, `${dir}.torrent`)),
      nfo: fs.existsSync(path.join(fullPath, `${dir}.nfo`)),
      txt: fs.existsSync(path.join(fullPath, `${dir}.txt`)),
      prez: fs.existsSync(path.join(fullPath, `${dir}.prez.txt`)),
      sourceNfo: fs.existsSync(path.join(fullPath, `${dir}.source.nfo`)),
      srcinfo: fs.existsSync(path.join(fullPath, `${dir}.srcinfo`))
    };

    items.push({
      name: dir,
      files,
      modifiedAt: stat.mtime
    });
  }

  // Sort
  if (sort === 'name_asc') {
    items.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'name_desc') {
    items.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sort === 'date_asc') {
    items.sort((a, b) => a.modifiedAt - b.modifiedAt);
  } else if (sort === 'date_desc') {
    items.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  const total = items.length;
  const totalPages = Math.ceil(total / perPage);
  const startIdx = (page - 1) * perPage;
  const paginatedItems = items.slice(startIdx, startIdx + perPage);

  return {
    items: paginatedItems,
    total,
    page,
    totalPages
  };
}

/**
 * Get detailed information about a media item
 */
function getMediaDetail(type, name) {
  const mediaDir = path.join(TORRENT_BASE, type, name);

  if (!fs.existsSync(mediaDir)) {
    return null;
  }

  // List all files in the media directory
  const files = [];
  const dirContents = fs.readdirSync(mediaDir);

  for (const file of dirContents) {
    const filePath = path.join(mediaDir, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile()) {
      files.push({
        name: file,
        size: stat.size,
        modifiedAt: stat.mtime
      });
    }
  }

  // Read cache metadata
  let metadata = null;
  if (type === 'films' || type === 'series') {
    const cacheType = type === 'films' ? 'movie' : 'tv';
    const safeName = toSafeName(name);
    const cachePath = path.join(CACHE_DIR_TMDB, `${cacheType}_${safeName}.json`);

    if (fs.existsSync(cachePath)) {
      try {
        const data = fs.readFileSync(cachePath, 'utf8');
        metadata = JSON.parse(data);
      } catch (e) {
        // Ignore parse errors
      }
    }
  } else if (type === 'musiques') {
    const safeName = toSafeName(name);
    const cachePath = path.join(CACHE_DIR_ITUNES, `${safeName}.json`);

    if (fs.existsSync(cachePath)) {
      try {
        const data = fs.readFileSync(cachePath, 'utf8');
        metadata = JSON.parse(data);
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  // Read .txt file for ID info
  let txtContent = '';
  const txtPath = path.join(mediaDir, `${name}.txt`);
  if (fs.existsSync(txtPath)) {
    try {
      txtContent = fs.readFileSync(txtPath, 'utf8');
    } catch (e) {
      // Ignore read errors
    }
  }

  // Check if has all artifacts
  const hasAllArtifacts =
    fs.existsSync(path.join(mediaDir, `${name}.torrent`)) &&
    fs.existsSync(path.join(mediaDir, `${name}.nfo`)) &&
    fs.existsSync(path.join(mediaDir, `${name}.txt`)) &&
    fs.existsSync(path.join(mediaDir, `${name}.prez.txt`));

  // Read source info from .srcinfo
  let sourceInfo = null;
  const srcInfoPath = path.join(mediaDir, `${name}.srcinfo`);
  if (fs.existsSync(srcInfoPath)) {
    try {
      sourceInfo = JSON.parse(fs.readFileSync(srcInfoPath, 'utf8'));
    } catch {}
  }

  // Check for TMDb ID override
  const override = (type === 'films' || type === 'series')
    ? db.getOverride(type, name)
    : null;

  return {
    name,
    files,
    metadata,
    txtContent,
    sourceInfo,
    hasAllArtifacts,
    override: override ? { id: override.api_id_override, apiType: override.api_type } : null
  };
}

/**
 * Read file content with security validation
 */
function getFileContent(type, name, filename) {
  // Validate filename contains only safe characters
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return null;
  }

  const filePath = path.join(TORRENT_BASE, type, name, filename);
  const normalizedPath = path.normalize(filePath);
  const mediaDir = path.join(TORRENT_BASE, type, name);

  // Security: ensure file is within the media directory
  if (!normalizedPath.startsWith(path.normalize(mediaDir))) {
    return null;
  }

  if (!fs.existsSync(normalizedPath)) {
    return null;
  }

  try {
    return fs.readFileSync(normalizedPath, 'utf8');
  } catch (e) {
    return null;
  }
}

/**
 * Get statistics across all media types
 */
function getStats() {
  const stats = {
    films: { count: 0 },
    series: { count: 0 },
    musiques: { count: 0 },
    totalSize: 0,
    lastScan: null
  };

  // Count items per type
  for (const type of ['films', 'series', 'musiques']) {
    const typeDir = path.join(TORRENT_BASE, type);
    if (fs.existsSync(typeDir)) {
      const dirs = fs.readdirSync(typeDir);
      stats[type].count = dirs.filter(d => {
        const fullPath = path.join(typeDir, d);
        return fs.statSync(fullPath).isDirectory();
      }).length;
    }
  }

  // Calculate total size
  function dirSize(dir) {
    if (!fs.existsSync(dir)) return 0;
    let size = 0;
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        size += stat.size;
      } else if (stat.isDirectory()) {
        size += dirSize(filePath);
      }
    }

    return size;
  }

  stats.totalSize = dirSize(TORRENT_BASE);

  // Get last scan time from status file
  if (fs.existsSync(STATUS_FILE)) {
    try {
      const stat = fs.statSync(STATUS_FILE);
      stats.lastScan = stat.mtime;
    } catch (e) {
      // Ignore errors
    }
  }

  return stats;
}

module.exports = {
  listMedia,
  getMediaDetail,
  getFileContent,
  getStats
};
