const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUserData: () => ipcRenderer.invoke('get-user-data'),
  saveUserData: (data) => ipcRenderer.invoke('save-user-data', data),
  searchAnime: (query, mode) => ipcRenderer.invoke('search-anime', query, mode),
  getEpisodes: (showId) => ipcRenderer.invoke('get-episodes', showId),
  getSources: (showId, episodeString, mode) => ipcRenderer.invoke('get-sources', showId, episodeString, mode),
  phimapiSearch: (query) => ipcRenderer.invoke('phimapi-search', query),
  phimapiEpisodes: (slug) => ipcRenderer.invoke('phimapi-episodes', slug),
  phimapiSources: (slug, episodeString) => ipcRenderer.invoke('phimapi-sources', slug, episodeString),
  cacheImage: (url) => ipcRenderer.invoke('cache-image', url),
  playVideo: (url, title) => ipcRenderer.invoke('play-video', url, title),
  downloadVideo: (url, fileName) => ipcRenderer.invoke('download-video', url, fileName),
  onLog: (cb) => ipcRenderer.on('log', (_e, entry) => cb(entry)),
});
