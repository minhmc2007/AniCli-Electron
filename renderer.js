window.api.onLog((entry) => {
    const level = entry.level;
    const format = `[${level.toUpperCase()}][main] ${entry.msg}`;
    if (level === 'error') console.error(format, entry.details || '');
    else if (level === 'warn') console.warn(format, entry.details || '');
    else console.log(format, entry.details || '');
});

lucide.createIcons();

let currentAnime = null;
let currentEpisode = null;
let userData = { favorites: [], collections: [] };
let liquidDraggableInstance = null; 
let animeSource = 'allanime';

const searchInput = document.getElementById('searchInput');
const modeSelect = document.getElementById('modeSelect');

const resultsGrid = document.getElementById('resultsGrid');
const favoritesGrid = document.getElementById('favoritesGrid');
const collectionsGrid = document.getElementById('collectionsGrid');
const collectionContentsGrid = document.getElementById('collectionContentsGrid');

const viewBrowse = document.getElementById('view-browse');
const viewDetails = document.getElementById('view-details');
const viewSources = document.getElementById('view-sources');
const viewCollections = document.getElementById('view-collections');
const viewOnboarding = document.getElementById('view-onboarding');
const viewSourceSelect = document.getElementById('view-source-select');
const sourceBadge = document.getElementById('sourceBadge');
const sourceBadgeLabel = document.getElementById('sourceBadgeLabel');
const currentSourceLabel = document.getElementById('currentSourceLabel');

const detailTitle = document.getElementById('detailTitle');
const episodesList = document.getElementById('episodesList');
const sourcesList = document.getElementById('sourcesList');
const currentEpBadge = document.getElementById('currentEpBadge');
const favLiquidToggle = document.getElementById('favLiquidToggle');

// --- Embedded Player Elements ---
const videoPlayer = document.getElementById('videoPlayer');
const playerWrapper = document.getElementById('playerWrapper');
const playerLoading = document.getElementById('playerLoading');
const loadingStatusText = document.getElementById('loadingStatusText');
const playerTitle = document.getElementById('playerTitle');
const sourceTabs = document.getElementById('sourceTabs');
const iosSlider = document.getElementById('iosSlider');
const sliderProgress = document.getElementById('sliderProgress');
const sliderThumb = document.getElementById('sliderThumb');
const sliderTooltip = document.getElementById('sliderTooltip');
const playPauseBtn = document.getElementById('playPauseBtn');
const centerPlayBtn = document.getElementById('centerPlayBtn');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const fullscreenBtn = document.getElementById('fullscreenBtn');

let hls = null;
let isDraggingSlider = false;

const collectionModal = document.getElementById('collectionModal');
const modalCollectionsList = document.getElementById('modalCollectionsList');
const newCollectionName = document.getElementById('newCollectionName');

async function loadUserData() {
    userData = await window.api.getUserData();
    renderFavorites(); renderCollections();
}

async function saveUserData() {
    await window.api.saveUserData(userData);
    renderFavorites(); renderCollections();
}

// --- Onboarding Logic ---
const greetings = ["Welcome", "こんにちは", "AniCli"];
async function startOnboarding() {
    document.body.classList.add('onboarding');
    switchView(viewOnboarding);
    
    const greetingEl = document.getElementById('onboardingGreeting');
    const btnWrapper = document.getElementById('getStartedWrapper');
    const getStartedBtn = document.getElementById('getStartedBtn');

    for (let i = 0; i < greetings.length; i++) {
        greetingEl.style.animation = 'none';
        void greetingEl.offsetWidth; // Trigger reflow
        greetingEl.textContent = greetings[i];
        greetingEl.style.animation = 'greetingIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
        await new Promise(r => setTimeout(r, 2000));
    }

    btnWrapper.classList.remove('hidden');
    
    getStartedBtn.onclick = async () => {
        userData.onboarded = true;
        await saveUserData();
        document.body.classList.remove('onboarding');
        switchView(viewSourceSelect);
        lucide.createIcons();
    };
}

// --- Draggable Dock Routing ---
const switcherInputs = document.querySelectorAll('#main-dock input[type="radio"]');
const dockIndicator = document.getElementById('dock-indicator');
const STEP_X = 76;

Draggable.create(dockIndicator, {
    type: 'x',
    trigger: '#main-dock',
    bounds: { minX: 0, maxX: 228 },
    onDragStart: function() {
        gsap.to(dockIndicator, { scaleX: 0.9, scaleY: 0.9, duration: 0.2 });
    },
    onDragEnd: function() {
        const distance = Math.abs(this.x - this.startX);
        if (distance < 5) return;
        const index = Math.round(this.x / STEP_X);
        const snappedX = index * STEP_X;
        gsap.to(dockIndicator, { x: snappedX, scaleX: 1, scaleY: 1, duration: 0.3, ease: "back.out(1.5)" });
        if (switcherInputs[index] && !switcherInputs[index].checked) {
            switcherInputs[index].checked = true;
            switchView(document.getElementById(switcherInputs[index].value));
        }
    }
});

switcherInputs.forEach((radio, index) => {
    radio.addEventListener('change', () => {
        if (radio.checked) {
            gsap.to(dockIndicator, { x: index * STEP_X, duration: 0.4, ease: "power2.out" });
            gsap.to(dockIndicator, { scaleX: 1.2, duration: 0.2, yoyo: true, repeat: 1 });
            switchView(document.getElementById(radio.value));
        }
    });
});

gsap.set(dockIndicator, { x: 0 });

function stopPlayer() {
    if (hls) {
        hls.destroy();
        hls = null;
    }
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.load();
    playerWrapper.classList.add('hidden');
}

function switchView(targetView) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    targetView.classList.add('active');

    if (targetView !== viewDetails) {
        stopPlayer();
    }
    
    if (targetView === viewCollections) {
        document.getElementById('collectionContentsTitle').style.display = 'none';
        document.getElementById('collectionContentsGrid').style.display = 'none';
        document.getElementById('collectionContentsDivider').style.display = 'none';
    }
}

// --- Source Selection ---
function setAnimeSource(source) {
    animeSource = source;
    userData.animeSource = source;
    saveUserData();

    if (source === 'phimapi') {
        modeSelect.style.display = 'none';
        sourceBadgeLabel.textContent = 'Ophim1';
        currentSourceLabel.textContent = 'Currently: Ophim1 (Vietsub)';
    } else {
        modeSelect.style.display = '';
        sourceBadgeLabel.textContent = 'AllAnime';
        currentSourceLabel.textContent = 'Currently: AllAnime (Sub/Dub)';
    }

    const browseRadio = document.querySelector('input[value="view-browse"]');
    if (browseRadio) browseRadio.checked = true;
    gsap.to(dockIndicator, { x: 0, duration: 0.4, ease: "power2.out" });
    switchView(viewBrowse);
    fetchTrending();
}

document.querySelectorAll('.source-card').forEach(card => {
    card.onclick = () => {
        setAnimeSource(card.dataset.source);
    };
});

sourceBadge.onclick = () => {
    switchView(viewSourceSelect);
    lucide.createIcons();
};

// --- RESTORED & RELIABLE BACK BUTTON NAVIGATION ---
document.getElementById('backBtn').onclick = () => {
    const browseRadio = document.querySelector('input[value="view-browse"]');
    if (browseRadio) browseRadio.checked = true;
    
    gsap.to(dockIndicator, { x: 0, duration: 0.4, ease: "power2.out" });
    switchView(viewBrowse);
};

document.getElementById('backToDetailsBtn').onclick = () => {
    switchView(viewDetails);
};

// --- Settings Logic ---
document.getElementById('changeSourceBtn').onclick = () => {
    switchView(viewSourceSelect);
    lucide.createIcons();
};

document.getElementById('resetWelcomeBtn').onclick = async () => {
    userData.onboarded = false;
    await saveUserData();
    showToast("Welcome Screen Reset! Restart to see it.");
};

document.getElementById('closeModalBtn').onclick = () => collectionModal.classList.add('hidden');

function getImageUrl(thumbnailStr) {
    if (!thumbnailStr) return '';
    if (thumbnailStr.startsWith('http')) return thumbnailStr;
    if (thumbnailStr.startsWith('//')) return `https:${thumbnailStr}`;
    
    // Reroute relative paths through the working proxy discovered
    // e.g. mcovers/... -> https://wp.youtube-anime.com/aln.youtube-anime.com/mcovers/...
    const path = thumbnailStr.startsWith('/') ? thumbnailStr : `/${thumbnailStr}`;
    return `https://wp.youtube-anime.com/aln.youtube-anime.com${path}?w=250`;
}

// --- Trending System Initialization ---
async function fetchTrending() {
    document.querySelector('.page-title').textContent = "Trending Anime";
    resultsGrid.innerHTML = `<div class="empty-state">Loading Trending...</div>`;
    let results;
    if (animeSource === 'phimapi') {
        results = await window.api.phimapiSearch('');
    } else {
        results = await window.api.searchAnime('', modeSelect.value);
    }
    resultsGrid.innerHTML = '';
    if (results.length === 0) resultsGrid.innerHTML = `<div class="empty-state">No results found.</div>`;
    else results.forEach(anime => buildAnimeCard(anime, resultsGrid));
}

loadUserData().then(async () => {
    console.log("[Main] User data loaded:", userData);
    animeSource = userData.animeSource || 'allanime';

    if (animeSource === 'phimapi') {
        modeSelect.style.display = 'none';
        sourceBadgeLabel.textContent = 'Ophim1';
        currentSourceLabel.textContent = 'Currently: Ophim1 (Vietsub)';
    } else {
        sourceBadgeLabel.textContent = 'AllAnime';
        currentSourceLabel.textContent = 'Currently: AllAnime (Sub/Dub)';
    }

    if (!userData.onboarded) {
        console.log("[Main] Starting onboarding...");
        await startOnboarding();
    } else if (!userData.animeSource) {
        console.log("[Main] Onboarded but no source selected, showing source select...");
        switchView(viewSourceSelect);
        lucide.createIcons();
    } else {
        console.log("[Main] Onboarded already, showing browse...");
        switchView(viewBrowse);
        try {
            await fetchTrending();
        } catch (e) {
            console.error("[Main] fetchTrending failed:", e);
            resultsGrid.innerHTML = '<div class="empty-state">Failed to load. Check connection.</div>';
        }
    }
}).catch(err => {
    console.error("[Main] Initialization failed:", err);
    switchView(viewBrowse);
    try {
        fetchTrending();
    } catch (e) {
        resultsGrid.innerHTML = '<div class="empty-state">Failed to load.</div>';
    }
});

searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (!query) { fetchTrending(); return; }
        
        const sourceLabel = animeSource === 'phimapi' ? 'Ophim1' : 'AllAnime';
        document.querySelector('.page-title').textContent = "Search Results";
        resultsGrid.innerHTML = `<div class="empty-state">Searching ${sourceLabel}...</div>`;
        let results;
        if (animeSource === 'phimapi') {
            results = await window.api.phimapiSearch(query);
        } else {
            results = await window.api.searchAnime(query, modeSelect.value);
        }
        resultsGrid.innerHTML = '';
        if (results.length === 0) resultsGrid.innerHTML = `<div class="empty-state">No results found.</div>`;
        else results.forEach(anime => buildAnimeCard(anime, resultsGrid));
    }
});

async function cacheCoverImage(url) {
    if (!url || url.startsWith('file://')) return;
    try {
        const localPath = await window.api.cacheImage(url);
        if (localPath && localPath.startsWith('/')) {
            return `file://${localPath}`;
        }
    } catch (_) {}
    return null;
}

function buildAnimeCard(anime, parentContainer) {
    const episodesCount = anime.availableEpisodes[modeSelect.value] || 0;
    const isFav = userData.favorites.some(f => f._id === anime._id);
    const imgUrl = getImageUrl(anime.thumbnail);
    
    const card = document.createElement('div');
    card.className = 'anime-card liquid-glass-panel';
    card.innerHTML = `
        <div class="anime-card-actions">
            <button class="glass-btn fav-btn ${isFav ? 'active' : ''}">
                <i data-lucide="heart"></i>
            </button>
            <button class="glass-btn col-btn">
                <i data-lucide="folder-plus"></i>
            </button>
        </div>
        ${imgUrl ? `<img src="${imgUrl}" class="anime-card-img" alt="Cover">` : `<div class="anime-card-img" style="background:#ddd; display:flex; align-items:center; justify-content:center;">No Image</div>`}
        <div class="anime-card-content">
            <div class="anime-card-title">${anime.name}</div>
            <div class="anime-card-meta">${episodesCount} Episodes</div>
        </div>
    `;

    card.onclick = (e) => {
        if (e.target.closest('.glass-btn')) return;
        loadAnimeDetails(anime);
    };

    card.querySelector('.fav-btn').onclick = async (e) => {
        e.stopPropagation();
        const favIdx = userData.favorites.findIndex(f => f._id === anime._id);
        const btn = e.currentTarget;
        
        if (favIdx >= 0) {
            userData.favorites.splice(favIdx, 1);
            btn.classList.remove('active');
            showToast("Removed from Favorites");
        } else {
            userData.favorites.push(anime);
            btn.classList.add('active');
            showToast("Added to Favorites");
        }
        await saveUserData();
    };

    card.querySelector('.col-btn').onclick = (e) => {
        e.stopPropagation(); openCollectionModal(anime);
    };

    parentContainer.appendChild(card);
    lucide.createIcons({ root: card });
    
    // Cache cover image in background, update src when ready
    const coverImg = card.querySelector('.anime-card-img');
    if (coverImg && coverImg.tagName === 'IMG') {
        cacheCoverImage(coverImg.src).then(cached => {
            if (cached) coverImg.src = cached;
        });
        coverImg.onerror = () => { 
            console.warn(`[Renderer] Thumbnail failed to load, trying fallback for: ${anime.name}`);
            coverImg.src = getImageUrl(anime.thumbnail); 
        };
    }
}

// --- DRAGGABLE GOO LIQUID SWITCH BINDINGS ---
function initLiquidDraggable(animeId) {
    if (liquidDraggableInstance) {
        liquidDraggableInstance[0].kill();
    }
    
    const isFav = userData.favorites.some(f => f._id === animeId);
    favLiquidToggle.setAttribute('aria-pressed', isFav);
    
    const config = {
        complete: isFav ? 100 : 0,
        active: false,
        bounce: true,
        hue: 355,
        delta: 0,
        bubble: true
    };

    const update = () => {
        favLiquidToggle.style.setProperty('--complete', config.complete);
        favLiquidToggle.style.setProperty('--hue', config.hue);
        favLiquidToggle.style.setProperty('--delta', config.delta);
        if (config.active) favLiquidToggle.dataset.active = true;
        else delete favLiquidToggle.dataset.active;
    };
    update();

    const toggleState = async () => {
        favLiquidToggle.dataset.pressed = "true";
        if (config.bubble) {
            config.active = true;
            update();
        }
        
        await Promise.allSettled(
            !config.bounce ? favLiquidToggle.getAnimations({ subtree: true }).map((a) => a.finished) : []
        );
        
        const pressed = favLiquidToggle.matches('[aria-pressed=true]');
        gsap.timeline({
            onComplete: () => {
                gsap.delayedCall(0.05, () => {
                    config.active = false;
                    update();
                    delete favLiquidToggle.dataset.pressed;
                    
                    const newState = !pressed;
                    favLiquidToggle.setAttribute('aria-pressed', newState);
                    
                    if (newState) {
                        if (!userData.favorites.some(f => f._id === currentAnime._id)) userData.favorites.push(currentAnime);
                        showToast("Saved to Favorites");
                    } else {
                        userData.favorites = userData.favorites.filter(f => f._id !== currentAnime._id);
                        showToast("Removed from Favorites");
                    }
                    saveUserData();
                });
            },
        })
        .to(config, {
            complete: pressed ? 0 : 100,
            duration: 0.12,
            delay: config.bounce && config.bubble ? 0.18 : 0,
            onUpdate: update
        });
    };

    liquidDraggableInstance = Draggable.create(document.createElement('div'), {
        handle: favLiquidToggle,
        onDragStart: function () {
            const toggleBounds = favLiquidToggle.getBoundingClientRect();
            const pressed = favLiquidToggle.matches('[aria-pressed=true]');
            this.dragBounds = pressed ? toggleBounds.left - this.pointerX : toggleBounds.left + toggleBounds.width - this.pointerX;
            config.active = true;
            update();
        },
        onDrag: function () {
            const pressed = favLiquidToggle.matches('[aria-pressed=true]');
            const dragged = this.x - this.startX;
            const complete = gsap.utils.clamp(0, 100, pressed ? gsap.utils.mapRange(this.dragBounds, 0, 0, 100, dragged) : gsap.utils.mapRange(0, this.dragBounds, 0, 100, dragged));
            
            config.complete = complete;
            config.delta = Math.min(Math.abs(this.deltaX), 12);
            update();
        },
        onDragEnd: function () {
            gsap.fromTo(config, 
                { complete: config.complete }, 
                {
                    complete: config.complete >= 50 ? 100 : 0,
                    duration: 0.15,
                    onUpdate: update,
                    onComplete: () => {
                        gsap.delayedCall(0.05, () => {
                            config.active = false;
                            update();
                            const newState = config.complete >= 50;
                            favLiquidToggle.setAttribute('aria-pressed', newState);
                            
                            if (newState) {
                                if (!userData.favorites.some(f => f._id === currentAnime._id)) userData.favorites.push(currentAnime);
                                showToast("Saved to Favorites");
                            } else {
                                userData.favorites = userData.favorites.filter(f => f._id !== currentAnime._id);
                                showToast("Removed from Favorites");
                            }
                            saveUserData();
                        });
                    }
                }
            );
        },
        onPress: function () { this.__pressTime = Date.now(); },
        onRelease: function () {
            this.__releaseTime = Date.now();
            config.delta = 0;
            update();
            if (this.__releaseTime - this.__pressTime <= 150) {
                toggleState();
            }
        }
    });
}

function getAnimeSource(anime) {
    return anime.__typename === 'Ophim1' ? 'phimapi' : 'allanime';
}

async function loadAnimeDetails(anime) {
    currentAnime = anime;
    detailTitle.textContent = anime.name;
    episodesList.innerHTML = `<div class="empty-state">Fetching episodes...</div>`;
    
    // Reset embedded player
    playerWrapper.classList.add('hidden');
    if (hls) hls.destroy();
    videoPlayer.src = '';

    switchView(viewDetails);
    
    initLiquidDraggable(anime._id);

    const src = getAnimeSource(anime);
    let epData;
    if (src === 'phimapi') {
        epData = await window.api.phimapiEpisodes(anime._id);
    } else {
        epData = await window.api.getEpisodes(anime._id);
    }
    const mode = src === 'phimapi' ? 'vietsub' : modeSelect.value;
    const episodes = epData[mode] || (src === 'phimapi' ? [] : epData[modeSelect.value]) || [];
    episodes.sort((a, b) => parseFloat(a) - parseFloat(b));
    episodesList.innerHTML = '';

    if (episodes.length === 0) episodesList.innerHTML = `<div class="empty-state">No episodes available.</div>`;
    else {
        episodes.forEach(ep => {
            const row = document.createElement('div');
            row.className = 'ep-row liquid-glass-panel';
            row.innerHTML = `<div class="ep-icon">#</div><div class="ep-info"><div class="ep-title">Episode ${ep}</div><div class="ep-subtitle">Tap to select sources</div></div><i data-lucide="chevron-right" class="icon-coral"></i>`;
            row.onclick = () => loadSources(ep);
            episodesList.appendChild(row);
        });
        lucide.createIcons({ root: episodesList });
    }
}

async function loadSources(epNumber) {
    currentEpisode = epNumber;
    playerTitle.textContent = `Episode ${epNumber}`;
    playerWrapper.classList.remove('hidden');
    
    // Reset Player UI
    playerLoading.classList.remove('hidden');
    loadingStatusText.textContent = "Decrypting Streams...";
    sourceTabs.innerHTML = '';
    
    playerWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });

    console.log(`[Renderer] Loading sources for Episode ${epNumber}...`);
    const src = getAnimeSource(currentAnime);
    let sources;
    if (src === 'phimapi') {
        sources = await window.api.phimapiSources(currentAnime._id, epNumber);
    } else {
        sources = await window.api.getSources(currentAnime._id, epNumber, modeSelect.value);
    }
    console.log(`[Renderer] Found ${sources.length} sources.`);

    if (sources.length === 0) {
        sourceTabs.innerHTML = '<div class="empty-state" style="color:#fff;">No sources found.</div>';
        playerLoading.classList.add('hidden');
        return;
    }

    sources.forEach((src, idx) => {
        const tab = document.createElement('div');
        tab.className = `source-tab ${idx === 0 ? 'active' : ''}`;
        
        let shortName = src.sourceName.split('(')[0].trim();
        if (shortName.toLowerCase() === 'source') shortName = `S${idx+1}`;
        tab.textContent = shortName;
        
        tab.onclick = () => {
            console.log(`[Renderer] Switching to source: ${src.sourceName}`);
            document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            playEmbeddedSource(src.sourceUrl);
        };
        sourceTabs.appendChild(tab);
    });

    if (sources.length > 0) playEmbeddedSource(sources[0].sourceUrl);
}

function playEmbeddedSource(url) {
    if (hls) {
        hls.destroy();
        hls = null;
    }

    // Completely reset video element to avoid demuxer state carry-over
    videoPlayer.pause();
    videoPlayer.removeAttribute('src'); 
    videoPlayer.load();

    playerLoading.classList.remove('hidden');
    loadingStatusText.textContent = "Loading Buffer...";
    console.log(`[Renderer] Attempting to play URL: ${url}`);

    videoPlayer.onerror = (e) => {
        // Ignore "errors" caused by switching sources or resetting the player
        if (!videoPlayer.src || videoPlayer.src === window.location.href || (videoPlayer.error && videoPlayer.error.code === 4 && !videoPlayer.getAttribute('src'))) {
            return; 
        }
        
        console.error(`[Renderer] Video Element Error:`, videoPlayer.error);
        showToast("Video Error: " + (videoPlayer.error ? videoPlayer.error.message : "Unknown"));
        playerLoading.classList.add('hidden');
    };

    // More robust HLS detection (includes clock.json links which are HLS wrappers)
    const isHls = url.includes('.m3u8') || url.includes('vcloud.pw') || url.includes('/hls/');

    if (isHls) {
        console.log(`[Renderer] HLS Stream detected.`);
        if (Hls.isSupported()) {
            hls = new Hls({
                xhrSetup: function(xhr, url) {
                    xhr.withCredentials = false;
                },
                // Add some retry logic for unstable streams
                manifestLoadingMaxRetry: 3,
                levelLoadingMaxRetry: 3
            });
            hls.loadSource(url);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log(`[Renderer] HLS Manifest Parsed. Playing...`);
                videoPlayer.play().catch(err => console.warn("[Renderer] Play prevented", err));
            });
            hls.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) {
                    console.error(`[Renderer] Fatal HLS Error:`, data);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            showToast("HLS Playback Failed");
                            playerLoading.classList.add('hidden');
                            break;
                    }
                }
            });
        } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            console.log(`[Renderer] Native HLS supported.`);
            videoPlayer.src = url;
            videoPlayer.play();
        }
    } else {
        console.log(`[Renderer] Generic Stream detected.`);
        videoPlayer.src = url;
        videoPlayer.play().catch(e => {
            console.error("[Renderer] Play failed", e);
            playerLoading.classList.add('hidden');
        });
    }
}

// Handle playing event to hide loader
videoPlayer.onplaying = () => {
    console.log(`[Renderer] Video started playing.`);
    playerLoading.classList.add('hidden');
};

videoPlayer.onwaiting = () => {
    console.log(`[Renderer] Video buffering...`);
    playerLoading.classList.remove('hidden');
    loadingStatusText.textContent = "Buffering...";
};

videoPlayer.onstalled = () => {
    console.warn(`[Renderer] Video stalled.`);
};

function renderFavorites() {
    favoritesGrid.innerHTML = '';
    if (userData.favorites.length === 0) favoritesGrid.innerHTML = `<div class="empty-state">No favorites saved.</div>`;
    else userData.favorites.forEach(anime => buildAnimeCard(anime, favoritesGrid));
}

function renderCollections() {
    collectionsGrid.innerHTML = '';
    if (userData.collections.length === 0) { collectionsGrid.innerHTML = `<div class="empty-state">No collections created. Save anime to start!</div>`; return; }
    userData.collections.forEach(col => {
        const folder = document.createElement('div');
        folder.className = 'collection-folder liquid-glass-panel';
        folder.innerHTML = `<i data-lucide="folder-heart"></i><div class="collection-title">${col.name}</div><div class="collection-count">${col.items.length} Items</div>`;
        folder.onclick = () => viewCollectionContents(col);
        collectionsGrid.appendChild(folder);
    });
    lucide.createIcons({ root: collectionsGrid });
}

function viewCollectionContents(col) {
    document.getElementById('collectionContentsDivider').style.display = 'block';
    const titleEl = document.getElementById('collectionContentsTitle');
    titleEl.style.display = 'block'; titleEl.textContent = col.name;
    collectionContentsGrid.style.display = 'grid'; collectionContentsGrid.innerHTML = '';
    if (col.items.length === 0) collectionContentsGrid.innerHTML = `<div class="empty-state">Empty Collection</div>`;
    else col.items.forEach(anime => buildAnimeCard(anime, collectionContentsGrid));
}

let activeModalAnime = null;
function openCollectionModal(anime) {
    activeModalAnime = anime;
    newCollectionName.value = '';
    modalCollectionsList.innerHTML = '';
    if (userData.collections.length === 0) modalCollectionsList.innerHTML = `<div class="empty-state" style="padding:10px;">No existing collections</div>`;
    else {
        userData.collections.forEach(col => {
            const item = document.createElement('div');
            item.className = 'modal-list-item liquid-glass-panel';
            item.textContent = col.name;
            item.onclick = async () => {
                if (!col.items.some(i => i._id === anime._id)) {
                    col.items.push(anime); await saveUserData(); showToast(`Added to ${col.name}`);
                } else showToast(`Already in ${col.name}`);
                collectionModal.classList.add('hidden');
            };
            modalCollectionsList.appendChild(item);
        });
    }
    collectionModal.classList.remove('hidden');
}

document.getElementById('createCollectionBtn').onclick = async () => {
    const name = newCollectionName.value.trim();
    if (!name || !activeModalAnime) return;
    const newCol = { id: Date.now().toString(), name: name, items: [activeModalAnime] };
    userData.collections.push(newCol); await saveUserData();
    showToast(`Created & Added to ${name}`); collectionModal.classList.add('hidden');
};

// --- Custom Player Controls & iOS Slider Logic ---
function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v < 10 ? "0" + v : v).filter((v, i) => v !== "00" || i > 0).join(":");
}

videoPlayer.ontimeupdate = () => {
    if (!isDraggingSlider) {
        const percent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        updateSliderUI(percent);
    }
    currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
};

videoPlayer.onloadedmetadata = () => {
    durationEl.textContent = formatTime(videoPlayer.duration);
};

function updateSliderUI(percent, isPreview = false) {
    percent = Math.max(0, Math.min(100, percent || 0));
    const rect = iosSlider.getBoundingClientRect();
    const px = (percent / 100) * rect.width;

    // Tooltip follows the mouse (or thumb during drag/playback)
    sliderTooltip.style.left = `${px}px`;
    const targetTime = (percent / 100) * (videoPlayer.duration || 0);
    sliderTooltip.textContent = formatTime(targetTime);

    // Only update progress and thumb if NOT in preview mode
    if (!isPreview) {
        sliderProgress.style.width = `${percent}%`;
        sliderThumb.style.left = `${px}px`;
    }
}

const handleSliderMove = (clientX, isPreview = false) => {
    const rect = iosSlider.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    updateSliderUI(percent, isPreview);
};

iosSlider.onmousedown = (e) => {
    isDraggingSlider = true;
    sliderThumb.classList.add('active');
    handleSliderMove(e.clientX, false); // Active drag, move everything
};

iosSlider.onmousemove = (e) => {
    if (!isDraggingSlider) {
        // Just hover: move tooltip only
        handleSliderMove(e.clientX, true);
    }
};

document.addEventListener('mousemove', (e) => {
    if (isDraggingSlider) handleSliderMove(e.clientX, false);
});

document.addEventListener('mouseup', (e) => {
    if (isDraggingSlider) {
        isDraggingSlider = false;
        sliderThumb.classList.remove('active');
        
        // Finalize seek
        const rect = iosSlider.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        videoPlayer.currentTime = (percent / 100) * videoPlayer.duration;
    }
});

iosSlider.onclick = (e) => {
    if (!isDraggingSlider) {
        handleSliderMove(e.clientX, false); // Click should move everything
        const rect = iosSlider.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        videoPlayer.currentTime = (percent / 100) * videoPlayer.duration;
    }
};

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    // Only handle keys if we're in the details view and player is active
    if (!viewDetails.classList.contains('active') || playerWrapper.classList.contains('hidden')) return;
    
    if (e.key === 'ArrowRight') {
        videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
        showToast("+10s");
    } else if (e.key === 'ArrowLeft') {
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
        showToast("-10s");
    } else if (e.key === ' ') {
        // Only toggle if not typing in an input
        if (document.activeElement.tagName === 'INPUT') return;
        e.preventDefault(); 
        if (videoPlayer.paused) videoPlayer.play();
        else videoPlayer.pause();
    }
});

playPauseBtn.onclick = centerPlayBtn.onclick = () => {
    if (videoPlayer.paused) videoPlayer.play();
    else videoPlayer.pause();
};

videoPlayer.onplay = () => {
    playPauseBtn.innerHTML = '<i data-lucide="pause"></i>';
    centerPlayBtn.innerHTML = '<i data-lucide="pause" style="width: 32px; height: 32px;"></i>';
    lucide.createIcons({ root: document.getElementById('playerWrapper') });
};

videoPlayer.onpause = () => {
    playPauseBtn.innerHTML = '<i data-lucide="play"></i>';
    centerPlayBtn.innerHTML = '<i data-lucide="play" style="width: 32px; height: 32px;"></i>';
    lucide.createIcons({ root: document.getElementById('playerWrapper') });
};

fullscreenBtn.onclick = () => {
    if (videoPlayer.requestFullscreen) videoPlayer.requestFullscreen();
    else if (videoPlayer.webkitRequestFullscreen) videoPlayer.webkitRequestFullscreen();
};

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg; toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}
