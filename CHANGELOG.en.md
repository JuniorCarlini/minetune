# Changelog

Every relevant change to Minetune is recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

Change types: **Added** (new features), **Changed** (changes to existing
features), **Deprecated** (will be removed in a future version), **Removed**, **Fixed**
(bugs) and **Security** (vulnerabilities).

## [0.3.1] - 2026-09-15

### Fixed

- On a fresh install the server starts in online mode (official accounts) and the gate
  refused everyone with "Something went wrong". In online mode the gate now just passes
  connections through, since Minecraft itself already guarantees each player's name; the
  per-name password applies in offline mode. The Players screen says which mode is on.

## [0.3.0] - 2026-09-15

In-game password per player name, multiple worlds with upload and download, panel and
website in three languages, and everything ready to install from EasyPanel and Umbrel.

### Added

- **Players' real IP behind a tunnel**: with "Proxy Protocol" on in playit.gg (or frp),
  the gate reads each player's IP, so bans and limits apply per person. It only accepts
  that header from the machine itself or the local network.
- **playit.gg without host networking** (`compose.tunnel-bridge.yaml`), for Docker Desktop
  on Mac and Windows, plus a guide to opening the server: port forwarding, tunnels that
  work for Minecraft Java and VPS firewalls on Oracle, Hetzner, Hostinger and Magalu Cloud.
- **EasyPanel template** generated from `deploy/compose.yaml`, with passwords created at
  install time, and an Umbrel app ready for the community store: a separate derived
  password for each use, data inside the app folder and pinned image versions.
- **Minetune Gate: a password per player name, inside the game**. The first time
  someone joins, a Minecraft window asks them to create a password, and it's asked
  again on every join. Nobody can join with someone else's name, kick out whoever is
  already playing or touch the world before typing the password. It works with Paper,
  Vanilla, Fabric and NeoForge from Minecraft 1.21.6 on, with no plugin or mod, and
  uses about 30 MB of RAM. In Players you can turn the password off and reset
  someone's password. On Paper, the server only accepts players coming through the
  gate and still sees each player's real IP. Home warns when the gate stops, and
  turning the password on while people play disconnects only those who joined
  without one.
- **Seed map on the website**: type a seed and see the biomes, structures
  (villages, strongholds, mansions, ancient cities, trial chambers and more) and
  spawn, from Minecraft Java 1.18 to 26.2, in the Overworld, the Nether and the End.
  It runs in the browser with cubiomes compiled to WebAssembly and was
  checked against a real 26.1.2 server. Clicking a spot or a structure
  opens its coordinates with a ready teleport command, including the
  ground height.
- **Public address in the panel**: `PUBLIC_ADDRESS` in `.env` sets what shows
  in "How to join" (a domain or tunnel address). Without it, the panel warns when the
  address shown only works on the same computer or network.
- **Whitelist from the online players menu**: "Add to whitelist" (or
  "Remove from whitelist") next to operator, kick and ban.
- **Multiple worlds**: create, rename, delete and switch the running world from the
  Worlds screen. Each world keeps its own settings, plugins and
  whitelist, operators and bans; a new world starts with no players.
- **Compatibility guards**: the panel won't switch a world saved by
  Paper to Vanilla, Fabric or NeoForge (the server crashed on start) or roll a
  map back to an older version, and explains why right on the field.
- **Panel and website in English and Spanish**, besides Portuguese. The language follows
  the browser and can be changed on the login screen and in Appearance; the website gained `/en/` and `/es/`.
- **Five new logos**: creeper with lever, redstone rack, redstone
  lamp, command block and redstone creeper.
- **Published images and deploy without the source code**: `minetune-panel`,
  `minetune-mc` and `minetune-backup` on GitHub Container Registry (amd64 and arm64),
  `deploy/compose.yaml` to paste into EasyPanel and a Community App Store for Umbrel.
- **Explanation in the "?" of every option**: the 59 game rules and all
  settings say in one sentence what they change in the game, in all three languages.
- **Upload, download and recover worlds**: upload a world as a .zip from the Worlds screen,
  download any world (the running one without disconnecting anyone) and recover a single
  world from a backup. Uploads are checked before unpacking and the panel explains what is
  wrong: programs and scripts, paths that leave the folder, "zip bombs", Bedrock worlds and
  files that aren't part of a world are refused; from the file's configuration only known
  panel options come in.

### Changed

- On phones, the side menu opens as a drawer and dialogs are centered.
- playit.gg agent on version 1.0.
- Server memory in GB, numbers only; the panel shows the maximum that fits the machine.
- Seed map: a compass marking spawn, a crosshair cursor, highlight when hovering a
  structure and a mark on the clicked spot.
- Tucano components on version 0.33.
- Website with panel screenshots in English and Spanish and a footer with only Home,
  Seed map, Changelog and GitHub.

### Fixed

- Players joining through the tunnel (playit) or a proxy were refused when
  someone had just joined: they all arrive with the same IP and Paper limited
  connections to one every 4 seconds per IP. That limit is now off.
- Text pasted by mistake into the world name became a folder named after the whole sentence;
  names that look like sentences are now refused when creating or renaming.

## [0.2.0] - 2026-09-13

A panel built for non-technical people: every screen follows one pattern, a Home screen
with alerts, official Minecraft versions, backup destination from the panel and
an official website with SEO and GEO.

### Added
- GitHub Pages website with a home page and changelog, in the same look as the panel.
  The website changelog is generated from this file on every push.
- Preview image (Open Graph, 1200×630) for website links on WhatsApp,
  Discord, X and LinkedIn.
- SEO and GEO on the official website: structured data (software, author, frequently
  asked questions and changelog path), `sitemap.xml`, `robots.txt` allowing
  search engines and AI assistants, `llms.txt` with the project summary and a visible
  FAQ section on the page.
- Minecraft version picker in Settings, with the official list for each
  server software (Paper, Purpur, Fabric, NeoForge and Vanilla), newest first,
  an option to always use the latest and test versions hidden by default.
- Warning when the chosen version needs another Java image, with the exact
  `MC_IMAGE_TAG` change, and when the change goes back to a version older
  than the world's.
- Backup destination configurable from the panel (Backups → Where to store): local disk,
  Cloudflare R2, AWS S3, your own S3 (RustFS/MinIO) or an advanced restic
  repository, with frequency, retention, pause without players and upload limit.
- "Test connection" button, which checks the destination before saving and explains
  a rejected credential, missing bucket, different password or unreachable
  address in plain language.
- On save, the repository is created if the destination is empty and the scheduler
  restarts with the new settings, without `make up`.
- Home screen with the server state in a sentence, "How to join the server" with
  an address to copy and "Needs attention" gathering the alerts (server
  off, memory full, game lagging, local-only or old backup) with the button
  that fixes each one.
- CPU usage on the Home screen, as a percentage of the machine's total capacity
  and with a bar, next to players, memory and performance.
- "Only whitelisted players can join" switch right on the Players page, applied
  immediately while the server is running.
- "Advanced options": technical names and settings that are easy to break stay hidden
  until the person turns the option on.

### Changed
- Every screen follows the same pattern: breadcrumb on subpages, a title with a
  sentence, page actions on the right, alerts with the button that fixes them, cards and
  a save bar only on forms. Loading and errors show in place of the
  content, with "Try again", without hiding the title.
- Menu reorganized by what people do: Main (Home, Players, Game
  rules), Server (Settings, Plugins and mods, Backups) and Advanced (Console).
- Texts in player language: administrators instead of op, guest list
  instead of whitelist, performance instead of TPS, backup copies
  instead of snapshots.
- Players: kick and ban live in each person's "More" menu.
- Game rules: search and categories filter inside the card itself.
- The `backup` container now loads `config/backup.env` on every start. The
  file takes priority over `.env`, is written with permission 600 and stays out
  of git. Without it, everything still comes from `.env` as before.
- Manual backups respect the same upload limit as the scheduler.

### Fixed
- On the Players page, the empty Operators card left a blank space
  below it; the notice now fills the card like in the Whitelist.
- The backup frequency picker closed on its own right after opening, without
  time to choose.
- On wide monitors, the panel content stopped at 1240px stuck to the left;
  it now follows the screen up to 1680px and stays centered.

## [0.1.0] - 2026-09-12

First version: server, backups, web panel and documentation.

### Added

#### Server
- Docker Compose stack with the `mc`, `backup`, `panel` and `docker-proxy` services.
- Server on `itzg/minecraft-server` with Java 25; Paper 26.2 by default and
  the option of Purpur, Fabric, NeoForge or Vanilla.
- Game settings in `config/server.env`, loaded on every start: just
  restart to apply.
- Plugins and mods declared per loader in `config/modrinth/<loader>.txt`.
- Paper performance patches (explosions, Alternate Current redstone, entity
  limits) and Chunky to pre-generate the world.
- Aikar GC flags enabled by default.
- Bedrock crossplay via Geyser and Floodgate, off by default.
- `make init` generates `.env` with random secrets and permission `600`.
- `make` commands to start, stop, restart, logs, console, backup, restore,
  update and checks.

#### Backups
- Backups with restic: incremental, deduplicated and encrypted.
- Destinations: local disk, AWS S3, Cloudflare R2 or RustFS (overlay
  `compose.s3-local.yaml`).
- Scheduled and manual backups, plus automatic ones before restore and update, with
  configurable retention and pause when the server is empty.
- Safe restore: keeps the current world and undoes the swap if something fails.

#### Panel
- Password login, signed session (HMAC), attempt limit and protection on
  state-changing actions.
- Overview with status, start/stop/restart and charts for players,
  memory, CPU and TPS.
- Console with live log and commands over RCON.
- Players: whitelist, operators, kick, ban and unban.
- Server settings with validation, grouped by topic.
- Game rules detected on the running version and applied to every dimension.
- Plugins and mods with Modrinth search.
- Backups: back up now, snapshot list and restore.
- Panel CLI for backup, snapshots and restore.

#### Interface
- Block look with Tucano components: square corners, beveled buttons and
  a Minecraft palette with green `#5CEC01`.
- Light, dark or system theme.
- Monocraft pixel font for all text and RuneIcons pixel icons.
- Three pixel-art logos (grass rack, creeper server, powered block), with a
  picker in the menu.
- "Minetune" name in gold in the style of Minecraft titles.
- Split login with an illustrated cover and author credit linking to GitHub.
- Game-style toggles, grass block loading animation and
  smooth page transitions.
- Notifications centered at the bottom and a confirmation before logging out.
- Responsive layout: on phones the menu becomes an icon bar.

#### Deploy and documentation
- Deploy guides for local, VPS and EasyPanel, and for internet access
  (port forward, playit.gg, VPS as a bridge).
- `compose.tunnel.yaml` overlay for the playit.gg tunnel.
- Architecture, backup and performance documentation.
- README with banner, screen captures and a complete guide.

### Security
- Panel listens only on `127.0.0.1` by default.
- RCON restricted to the compose internal network.
- Docker access through a proxy with an allowlist: only reading status and
  logs and starting, stopping or restarting containers.

[0.3.1]: https://github.com/JuniorCarlini/minetune/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/JuniorCarlini/minetune/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/JuniorCarlini/minetune/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JuniorCarlini/minetune/releases/tag/v0.1.0
