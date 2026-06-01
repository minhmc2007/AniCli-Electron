const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

let mainWindow;

const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0";
const ALLANIME_REFR = "https://youtu-chan.com";
const ALLANIME_API = "https://api.allanime.day/api";
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
    '*://wp.youtube-anime.com/*', '*://*.wp.youtube-anime.com/*'
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
  const decoded = decodeAllAnimeCipher(sourceUrl);
  log('info', `Resolving: ${decoded}`);

  if (decoded.includes('mp4upload.com')) {
    try {
      const res = await fetch(decoded, { headers: { Referer: ALLANIME_REFR, 'User-Agent': AGENT } });
      const text = await res.text();
      const m = text.match(/src: "([^"]*)"/);
      if (m) return [{ link: m[1], resolutionStr: "Mp4Upload" }];
    } catch (e) { log('error', 'Mp4Upload resolution failed', e.message); }
  }

  if (!decoded.startsWith('/')) return [{ link: decoded, resolutionStr: "External" }];

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
  log('info', searchQuery ? `Search: "${searchQuery}"` : 'Fetching trending');
  const query = `query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name thumbnail availableEpisodes __typename } }}`;
  const searchObj = { allowAdult: false, allowUnknown: false };
  if (searchQuery?.trim()) searchObj.query = searchQuery;
  try {
    const data = await fetchApi(query, { search: searchObj, limit: 40, page: 1, translationType: mode, countryOrigin: "ALL" });
    return data.shows.edges || [];
  } catch (e) { log('error', 'Search failed', e.message); return []; }
});

ipcMain.handle('get-episodes', async (_, showId) => {
  const query = `query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail }}`;
  try { const data = await fetchApi(query, { showId }); return data.show.availableEpisodesDetail || {}; }
  catch (e) { return {}; }
});

ipcMain.handle('get-sources', async (_, showId, episodeString, mode = "sub") => {
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

    return resolved;
  } catch (e) { return []; }
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
