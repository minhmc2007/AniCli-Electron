const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

let mainWindow;

const cacheStore = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cacheGet(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cacheStore.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data) {
  cacheStore.set(key, { ts: Date.now(), data });
}

function cacheKey(...args) {
  return args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join('::');
}

const imageCacheDir = path.join(app.getPath('userData'), 'image-cache');

const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0";
const ALLANIME_REFR = "https://youtu-chan.com";
const ALLANIME_API = "https://api.allanime.day/api";
const PHIMAPI_BASE = "https://ophim1.com";
const PHIMAPI_IMG = "https://img.ophim.live";
const userDataPath = path.join(app.getPath('userData'), 'anicli-data.json');

function log(level, msg, details) {
  const entry = { ts: Date.now(), level, msg, src: 'main', details };
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('log', entry); } catch (_) {}
  }
  const fn = level === 'error' ? console.error : console.log;
  details ? fn(`[${level}] ${msg}`, details) : fn(`[${level}] ${msg}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 850, backgroundColor: '#FEEAC9', titleBarStyle: 'hiddenInset',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });

  // INTERCEPT HEADERS FOR VIDEO STREAMS (FIXES 403 / DEMUXER ERRORS)
  // INTERCEPT HEADERS FOR VIDEO STREAMS & ASSETS (FIXES 403 / DEMUXER ERRORS)
  const { session } = require('electron');
  const domains = [
    '*://allanime.day/*', '*://*.allanime.day/*', 
    '*://youtu-chan.com/*', '*://*.youtu-chan.com/*', 
    '*://allanime.pro/*', '*://*.allanime.pro/*',
    '*://wixmp.com/*', '*://*.wixmp.com/*',
    '*://vcloud.pw/*', '*://*.vcloud.pw/*',
    '*://uns.bio/*', '*://*.uns.bio/*',
    '*://mp4upload.com/*', '*://*.mp4upload.com/*',
    '*://fast4speed.rsvp/*', '*://*.fast4speed.rsvp/*',
    '*://wp.youtube-anime.com/*', '*://*.wp.youtube-anime.com/*',
    '*://ophim1.com/*', '*://*.ophim1.com/*',
    '*://img.ophim.live/*', '*://*.img.ophim.live/*',
    '*://ophim17.cc/*', '*://*.ophim17.cc/*',
    '*://opstream11.com/*', '*://*.opstream11.com/*',
    '*://vip.opstream11.com/*', '*://*.vip.opstream11.com/*'
  ];

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: domains }, (details, callback) => {
    let referer = ALLANIME_REFR;
    
    // Use the specialized referer for the image proxy
    if (details.url.includes('wp.youtube-anime.com')) {
        referer = 'https://allmanga.to/';
    }

    details.requestHeaders['Referer'] = referer;
    details.requestHeaders['User-Agent'] = AGENT;
    
    if (details.url.includes('allanime.day') || details.url.includes('youtube-anime.com')) {
        details.requestHeaders['Accept'] = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
    }
    delete details.requestHeaders['Origin'];
    callback({ requestHeaders: details.requestHeaders });
  });

  // BYPASS CORS (FIXES COVERS NOT DISPLAYING)
  session.defaultSession.webRequest.onHeadersReceived({ urls: domains }, (details, callback) => {
    const responseHeaders = details.responseHeaders;
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    callback({ responseHeaders });
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  log('info', 'App ready');
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-user-data', () => {
  if (fs.existsSync(userDataPath)) return JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
  return { favorites: [], collections: [] };
});

ipcMain.handle('save-user-data', (_, data) => {
  fs.writeFileSync(userDataPath, JSON.stringify(data));
  return true;
});

// --- Image Cache ---
if (!fs.existsSync(imageCacheDir)) fs.mkdirSync(imageCacheDir, { recursive: true });

ipcMain.handle('cache-image', async (_, url) => {
  if (!url) return '';
  const hash = crypto.createHash('md5').update(url).digest('hex');
  const ext = path.extname(new URL(url).pathname) || '.jpg';
  const localPath = path.join(imageCacheDir, `${hash}${ext}`);

  if (fs.existsSync(localPath)) return localPath;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
    if (!res.ok) return url;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localPath, buf);
    return localPath;
  } catch (e) {
    return url;
  }
});

function decryptAllAnime(tobeparsed) {
  const keyHashHex = crypto.createHash('sha256').update('Xot36i3lK3:v1').digest('hex');
  const key = Buffer.from(keyHashHex, 'hex');
  const buf = Buffer.from(tobeparsed, 'base64');
  const iv = Buffer.from(buf.subarray(1, 13).toString('hex') + '00000002', 'hex');
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
  let decrypted = decipher.update(buf.subarray(13, buf.length - 16));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

const decodeAllAnimeCipher = (cipher) => {
  if (!cipher.startsWith('--')) return cipher;
  const hex = cipher.slice(2);
  const map = {
    '01': '9', '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8',
    '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o',
    '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
    '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O',
    '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
    '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%',
  };
  let decoded = '';
  for (let i = 0; i < hex.length; i += 2) decoded += map[hex.substr(i, 2)] || '';
  return decoded.replace(/\/clock/g, '/clock.json');
};

async function resolveStreamLinks(sourceUrl) {
  const ck = cacheKey('resolveStream', sourceUrl);
  const cached = cacheGet(ck);
  if (cached) return cached;

  const decoded = decodeAllAnimeCipher(sourceUrl);
  log('info', `Resolving: ${decoded}`);

  if (decoded.includes('mp4upload.com')) {
    try {
      const res = await fetch(decoded, { headers: { Referer: ALLANIME_REFR, 'User-Agent': AGENT } });
      const text = await res.text();
      const m = text.match(/src: "([^"]*)"/);
      if (m) { const r = [{ link: m[1], resolutionStr: "Mp4Upload" }]; cacheSet(ck, r); return r; }
    } catch (e) { log('error', 'Mp4Upload resolution failed', e.message); }
  }

  if (!decoded.startsWith('/')) { const r = [{ link: decoded, resolutionStr: "External" }]; cacheSet(ck, r); return r; }

  try {
    const res = await fetch(`https://allanime.day${decoded}`, { headers: { Referer: ALLANIME_REFR, 'User-Agent': AGENT } });
    const text = await res.text();
    const links = [];
    try {
      const json = JSON.parse(text);
      if (json.links && Array.isArray(json.links)) {
        for (const l of json.links) links.push({ link: l.link, resolutionStr: l.resolutionStr || "Default" });
      }
      if (links.length === 0 && Array.isArray(json)) {
        for (const l of json) if (l.url && (l.format === 'hls' || l.url.includes('.m3u8'))) links.push({ link: l.url, resolutionStr: "HLS" });
      }
    } catch (_) {
      const r = /"link":"([^"]+)"(?:.*?"resolutionStr":"([^"]+)")?/g; let m;
      while ((m = r.exec(text)) !== null) links.push({ link: m[1], resolutionStr: m[2] || "Default" });
    }
    cacheSet(ck, links);
    return links;
  } catch (e) { return []; }
}

async function fetchApi(query, variables, hash = null) {
  let url = ALLANIME_API;
  const options = { headers: { Referer: ALLANIME_REFR, 'User-Agent': AGENT } };
  if (hash) {
    options.method = 'GET';
    url = `${ALLANIME_API}?${new URLSearchParams({ variables: JSON.stringify(variables), extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }) }).toString()}`;
  } else {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ query, variables });
  }
  const res = await fetch(url, options);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { tobeparsed: text }; }
  if (json.tobeparsed) return JSON.parse(decryptAllAnime(json.tobeparsed));
  if (json.data?.tobeparsed) return JSON.parse(decryptAllAnime(json.data.tobeparsed));
  return json.data;
}

ipcMain.handle('search-anime', async (_, searchQuery, mode = "sub") => {
  const ck = cacheKey('search-anime', searchQuery, mode);
  const cached = cacheGet(ck);
  if (cached) return cached;

  log('info', searchQuery ? `Search: "${searchQuery}"` : 'Fetching trending');
  const query = `query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name thumbnail availableEpisodes __typename } }}`;
  const searchObj = { allowAdult: false, allowUnknown: false };
  if (searchQuery?.trim()) searchObj.query = searchQuery;
  try {
    const data = await fetchApi(query, { search: searchObj, limit: 40, page: 1, translationType: mode, countryOrigin: "ALL" });
    const result = data.shows.edges || [];
    cacheSet(ck, result);
    return result;
  } catch (e) { log('error', 'Search failed', e.message); return []; }
});

ipcMain.handle('get-episodes', async (_, showId) => {
  const ck = cacheKey('get-episodes', showId);
  const cached = cacheGet(ck);
  if (cached) return cached;

  const query = `query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail }}`;
  try {
    const data = await fetchApi(query, { showId });
    const result = data.show.availableEpisodesDetail || {};
    cacheSet(ck, result);
    return result;
  }
  catch (e) { return {}; }
});

ipcMain.handle('get-sources', async (_, showId, episodeString, mode = "sub") => {
  const ck = cacheKey('get-sources', showId, episodeString, mode);
  const cached = cacheGet(ck);
  if (cached) return cached;

  const query = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}`;
  const hash = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";
  try {
    let data = await fetchApi(query, { showId, translationType: mode, episodeString }, hash);
    if (!data?.episode?.sourceUrls) data = await fetchApi(query, { showId, translationType: mode, episodeString });
    const resolved = [];
    for (const src of (data?.episode?.sourceUrls || [])) {
      if (!src.sourceUrl) continue;
      const streams = await resolveStreamLinks(src.sourceUrl);
      streams.forEach(s => resolved.push({ sourceName: `${src.sourceName || "Source"} (${s.resolutionStr})`, sourceUrl: s.link }));
    }
    
    // Sort to prioritize Yt-mp4 (YouTube) sources at the top
    resolved.sort((a, b) => {
      const isA_Yt = a.sourceName.toLowerCase().includes('yt') || a.sourceName.toLowerCase().includes('youtube');
      const isB_Yt = b.sourceName.toLowerCase().includes('yt') || b.sourceName.toLowerCase().includes('youtube');
      if (isA_Yt && !isB_Yt) return -1;
      if (!isA_Yt && isB_Yt) return 1;
      return 0;
    });

    cacheSet(ck, resolved);
    return resolved;
  } catch (e) { return []; }
});

// --- Ophim1 Handlers ---

ipcMain.handle('phimapi-search', async (_, searchQuery) => {
  log('info', searchQuery ? `Ophim1 Search: "${searchQuery}"` : 'Ophim1 Trending');
  try {
    let url;
    if (searchQuery?.trim()) {
      url = `${PHIMAPI_BASE}/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&limit=20`;
    } else {
      url = `${PHIMAPI_BASE}/v1/api/danh-sach/hoat-hinh?page=1&limit=40&sort_field=modified.time&sort_type=desc`;
    }
    const res = await fetch(url, { headers: { 'User-Agent': AGENT } });
    const data = await res.json();
    const payload = searchQuery?.trim() ? data.data : data.data;
    const items = payload?.items || [];
    const cdn = payload?.APP_DOMAIN_CDN_IMAGE || PHIMAPI_IMG;
    return items.map(item => ({
      _id: item.slug,
      name: item.name,
      thumbnail: item.poster_url?.startsWith('http')
        ? item.poster_url
        : item.poster_url?.includes('/')
          ? `${cdn}/${item.poster_url}`
          : `${cdn}/uploads/movies/${item.poster_url}`,
      availableEpisodes: { sub: parseInt(item.episode_current) || 0 },
      __typename: 'Ophim1',
      year: item.year,
      lang: item.lang,
      quality: item.quality,
    }));
  } catch (e) { log('error', 'Ophim1 search failed', e.message); return []; }
});

ipcMain.handle('phimapi-episodes', async (_, slug) => {
  log('info', `Ophim1 Fetching episodes for: ${slug}`);
  try {
    const res = await fetch(`${PHIMAPI_BASE}/phim/${slug}`, { headers: { 'User-Agent': AGENT } });
    const data = await res.json();
    const allEps = [];
    for (const server of (data.episodes || [])) {
      for (const ep of (server.server_data || [])) {
        const num = parseFloat(ep.name);
        if (!isNaN(num)) allEps.push(num.toString());
      }
    }
    const unique = [...new Set(allEps)].sort((a, b) => parseFloat(a) - parseFloat(b));
    log('info', `Ophim1 found ${unique.length} episodes for ${slug}`);
    return { vietsub: unique };
  } catch (e) { log('error', 'Ophim1 episodes failed', e.message); return {}; }
});

ipcMain.handle('phimapi-sources', async (_, slug, episodeString) => {
  log('info', `Ophim1 Fetching sources for ${slug} ep ${episodeString}`);
  try {
    const res = await fetch(`${PHIMAPI_BASE}/phim/${slug}`, { headers: { 'User-Agent': AGENT } });
    const data = await res.json();
    const sources = [];
    for (const server of (data.episodes || [])) {
      for (const ep of (server.server_data || [])) {
        if (ep.name === episodeString || parseFloat(ep.name) === parseFloat(episodeString)) {
          sources.push({ sourceName: server.server_name || 'Server', sourceUrl: ep.link_m3u8 });
        }
      }
    }
    log('info', `Ophim1 found ${sources.length} source(s) for ep ${episodeString}`);
    return sources.length > 0 ? sources : [{ sourceName: 'Default', sourceUrl: '' }];
  } catch (e) { log('error', 'Ophim1 sources failed', e.message); return []; }
});

ipcMain.handle('play-video', async (_, url, title) => {
  const mpv = spawn('mpv', ['--tls-verify=no', `--referrer=${ALLANIME_REFR}`, `--force-media-title=${title}`, url]);
  mpv.on('error', (e) => log('error', 'mpv failed', e.message));
  return true;
});

ipcMain.handle('download-video', async (_, url, fileName) => {
  const dir = app.getPath('downloads');
  const outPath = path.join(dir, `${fileName}.mp4`);
  await new Promise((resolve, reject) => {
    const proc = execFile('aria2c', [url, '-o', outPath, '--header', `Referer: ${ALLANIME_REFR}`], (err) => {
      if (err && !err.killed) reject(err); else resolve();
    });
    proc.on('error', reject);
  });
  return dir;
});
