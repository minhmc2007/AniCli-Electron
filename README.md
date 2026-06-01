# 🌸 Ani-Cli Electron

![License](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)
![Electron](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white)

> **The Cozy Anime & Manga Client.**
> A desktop port of the [ani-cli](https://github.com/pystardust/ani-cli) shell script, built with Electron.

---

## ✨ Features

*   **🎨 Cozy UI**: A relaxing, pastel-themed interface with milky glassmorphism.
*   **🎞️ Dual Anime Sources**: Switch between **AllAnime** (EN Sub/Dub) and **Ophim1** (Vietsub).
*   **🔍 Multi-Source**: Automatic source detection per anime — favorites work regardless of active source.
*   **❤️ Favorites & Collections**: Save and organize your anime.
*   **📦 Cross-Platform**: Runs on Linux, Windows, and macOS via Electron.
*   **⚡ Optimized Caching**: In-memory API cache and disk-based image cache for fast repeat loads.

---

## 🖥️ Screenshots

| | |
|---|---|
| Browse AllAnime | Browse Ophim1 |
| Details & Episodes | Source Selection |
| Favorites | Collections |

---

## 🛠️ Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [npm](https://www.npmjs.com/)

### Setup

```bash
# Clone
git clone https://github.com/minhmc2007/AniCli-Electron
cd AniCli-Electron

# Install Dependencies
npm install

# Run
npm start
```

### Build

```bash
# Package for current platform
npm run build
```

---

## 🏗️ Architecture

*   **`main.js`**: Electron main process — IPC handlers, AllAnime GraphQL/AES, Ophim1 REST, caching, image cache.
*   **`preload.js`**: Context bridge exposing API methods to the renderer.
*   **`renderer.js`**: All frontend logic — view switching, OOBE flow, anime cards, player, favorites, collections.
*   **`index.html`**: Single-page app with 6 views (onboarding, source-select, browse, details, sources, collections, settings).
*   **`styles.css`**: Liquid-glass UI, source cards, anime grid, dock, player.

---

## 🙏 Credits

This project was built upon the hard work of many providers and developers:

*   **Original Logic**: [ani-cli](https://github.com/pystardust/ani-cli) by pystardust.
*   **Anime Scrapers**: [Sudachi](https://github.com/KabosuNeko/Sudachi), [OPhim1](https://ophim1.com).
*   **UI/Framework**: [Electron](https://www.electronjs.org).

---

## 📜 License

This project is licensed under the **GPLv3 License**, inheriting the license from the original `ani-cli` project. If you fork this project, you **must** keep the source code open under the same license.
