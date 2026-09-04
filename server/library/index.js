
/**
 * Local music library scanner.
 * Scans configured directories for audio files, parses metadata, and indexes them.
 *
 * Scan + metadata indexing with optional cross-platform watching (no transcoding).
 */

import fs from 'fs';
import path from 'path';
import { insert, find, findOne, update, all } from '../db/store.js';
import chokidar from 'chokidar';
import { parseFile } from 'music-metadata';

/* Supported audio extensions */
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.ogg', '.wav', '.aac', '.wma', '.m4a', '.opus', '.ape',
]);

/* ------------------------------------------------------------------ */
/*  Scanning                                                          */
/* ------------------------------------------------------------------ */

function isAudioFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

/**
 * Recursively scan a directory for audio files.
 * Returns an array of { filePath, fileName, size, mtime }.
 */
function scanDirectory(dirPath, maxDepth = 5) {
  const results = [];
  function walk(currentDir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && isAudioFile(entry.name)) {
        try {
          const stat = fs.statSync(fullPath);
          results.push({
            filePath: fullPath,
            fileName: entry.name,
            size: stat.size,
            mtime: stat.mtimeMs,
          });
        } catch {
          // skip unreadable files
        }
      }
    }
  }
  walk(dirPath, 0);
  return results;
}

/* ------------------------------------------------------------------ */
/*  Basic metadata extraction (ID3-like from filename fallback)       */
/* ------------------------------------------------------------------ */

/**
 * Extract basic metadata from file path/name.
 * Phase 2: replace with ffprobe/music-metadata npm package.
 */
function extractBasicMetadata(filePath) {
  const fileName = path.basename(filePath, path.extname(filePath));
  const ext = path.extname(filePath).toLowerCase();

  // Try to parse "Artist - Title.mp3" pattern
  const dashMatch = fileName.match(/^(.+?)\s*-\s*(.+)$/);
  let title, artist;
  if (dashMatch) {
    artist = dashMatch[1].trim();
    title = dashMatch[2].trim();
  } else {
    title = fileName;
    artist = '未知艺术家';
  }

  return {
    title,
    artist,
    album: '本地音乐',
    ext: ext.slice(1), // without dot
    filePath,
    fileName,
  };
}

function firstText(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ');
  return String(value || '').trim();
}

/** Read embedded tags when available, while retaining filename fallback for damaged files. */
async function extractMetadata(filePath) {
  const fallback = extractBasicMetadata(filePath);
  try {
    const metadata = await parseFile(filePath, { skipCovers: true });
    const common = metadata.common || {};
    const trackNo = Number(common.track?.no);
    const discNo = Number(common.disk?.no);
    const duration = Number(metadata.format?.duration);
    return {
      ...fallback,
      title: firstText(common.title) || fallback.title,
      artist: firstText(common.artist) || firstText(common.artists) || fallback.artist,
      album: firstText(common.album) || fallback.album,
      albumArtist: firstText(common.albumartist) || undefined,
      genre: firstText(common.genre) || undefined,
      year: Number.isFinite(Number(common.year)) ? Number(common.year) : undefined,
      trackNo: Number.isFinite(trackNo) && trackNo > 0 ? trackNo : undefined,
      discNo: Number.isFinite(discNo) && discNo > 0 ? discNo : undefined,
      duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : undefined,
    };
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/*  Indexing                                                          */
/* ------------------------------------------------------------------ */

/**
 * Run a full scan and update the local index.
 * Deduplicates by filePath.
 * Returns summary.
 */
function runScan(libraryPaths) {
  const allFiles = [];
  for (const dirPath of libraryPaths) {
    if (fs.existsSync(dirPath)) {
      allFiles.push(...scanDirectory(dirPath));
    }
  }

  let added = 0, updated = 0;
  for (const file of allFiles) {
    const existing = findOne('library_songs', s => s.filePath === file.filePath);
    const meta = extractBasicMetadata(file.filePath);
    const record = {
      ...meta,
      size: file.size,
      mtime: file.mtime,
      source: 'local',
      deletedAt: undefined,
    };
    if (existing) {
      update('library_songs', s => s.filePath === file.filePath, record);
      updated++;
    } else {
      insert('library_songs', record);
      added++;
    }
  }

  const total = all('library_songs').length;
  return { total, added, updated, scanned: allFiles.length, paths: libraryPaths };
}

function normalizedLibraryRoots(libraryPaths) {
  return libraryPaths
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
}

function isInsideRoot(filePath, root) {
  const candidate = path.resolve(filePath);
  const base = path.resolve(root);
  return candidate === base || candidate.startsWith(`${base}${path.sep}`);
}

/**
 * Enriched sequential scan. Sequential parsing is intentional: music-metadata
 * recommends it for large libraries so one scan cannot exhaust memory/FDs.
 */
async function runScanAsync(libraryPaths) {
  const roots = normalizedLibraryRoots(libraryPaths);
  const allFiles = [];
  for (const dirPath of roots) {
    if (fs.existsSync(dirPath)) allFiles.push(...scanDirectory(dirPath));
  }

  let added = 0;
  let updated = 0;
  for (const file of allFiles) {
    const existing = findOne('library_songs', (song) => song.filePath === file.filePath);
    if (existing && !existing.deletedAt && Number(existing.size) === file.size && Number(existing.mtime) === file.mtime) {
      continue;
    }
    const meta = await extractMetadata(file.filePath);
    const record = { ...meta, size: file.size, mtime: file.mtime, source: 'local', deletedAt: undefined };
    if (existing) {
      update('library_songs', (song) => song.filePath === file.filePath, record);
      updated += 1;
    } else {
      insert('library_songs', record);
      added += 1;
    }
  }

  const indexed = all('library_songs');
  let removed = 0;
  for (const song of indexed) {
    if (song.source !== 'local' || !roots.some((root) => isInsideRoot(song.filePath, root))) continue;
    if (!allFiles.some((file) => file.filePath === song.filePath)) {
      removed += update('library_songs', (item) => item.id === song.id, { deletedAt: new Date().toISOString() });
    }
  }

  const active = all('library_songs').filter((song) => !song.deletedAt);
  return { total: active.length, added, updated, removed, scanned: allFiles.length, paths: roots };
}

let libraryWatcher = null;
let scanTimer = null;

/** Start an optional cross-platform watcher; disabled unless explicitly enabled. */
function startLibraryWatcher(libraryPaths, { debounceMs = 1200, onScan } = {}) {
  stopLibraryWatcher();
  const roots = normalizedLibraryRoots(libraryPaths).filter((root) => fs.existsSync(root));
  if (roots.length === 0) return null;
  libraryWatcher = chokidar.watch(roots, {
    ignoreInitial: true,
    depth: 5,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
    ignored: (_filePath, stats) => Boolean(stats?.isDirectory() && path.basename(_filePath).startsWith('.')),
  });
  const schedule = (filePath) => {
    if (!isAudioFile(filePath)) return;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      void runScanAsync(roots).then((result) => onScan?.(result)).catch((error) => console.error('[library] watcher scan failed:', error.message));
    }, debounceMs);
  };
  libraryWatcher.on('add', schedule).on('change', schedule).on('unlink', schedule);
  return libraryWatcher;
}

function stopLibraryWatcher() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  if (libraryWatcher) void libraryWatcher.close();
  libraryWatcher = null;
}

/* ------------------------------------------------------------------ */
/*  Search                                                             */
/* ------------------------------------------------------------------ */

function searchLocalSongs(query) {
  const q = query.toLowerCase();
  return find('library_songs', song => Boolean(
    !song.deletedAt && (
      song.title.toLowerCase().includes(q)
      || song.artist.toLowerCase().includes(q)
      || song.album.toLowerCase().includes(q)
    ),
  ));
}

/* ------------------------------------------------------------------ */
/*  Express routes                                                    */
/* ------------------------------------------------------------------ */

import { streamLocalSong } from './stream.js';
import { Router } from 'express';

const router = Router();

router.get('/scan', async (_req, res) => {
  const paths = (process.env.MUSIC_LIBRARY_PATHS || '').split(';').filter(Boolean);
  if (paths.length === 0) {
    return res.json({ error: '未配置 MUSIC_LIBRARY_PATHS', hint: '设置环境变量指向本地音乐目录，多个用;分隔' });
  }
  try {
    const result = await runScanAsync(paths);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '曲库扫描失败', message: error.message });
  }
});

router.get('/search', (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ songs: [], total: 0 });
  const songs = searchLocalSongs(query);
  res.json({ songs, total: songs.length });
});

router.get('/songs', (_req, res) => {
  const songs = all('library_songs').filter((song) => !song.deletedAt);
  res.json({ songs, total: songs.length });
});

function listLocalSongs() {
  return all('library_songs').filter((song) => !song.deletedAt);
}

export {
  router as libraryRouter,
  runScan,
  runScanAsync,
  searchLocalSongs,
  listLocalSongs,
  extractBasicMetadata,
  extractMetadata,
  startLibraryWatcher,
  stopLibraryWatcher,
};

router.get('/stream/:id', streamLocalSong);
