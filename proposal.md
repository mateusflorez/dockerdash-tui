# DockerDash

[![npm version](https://img.shields.io/npm/v/dockerdash-tui.svg)](https://www.npmjs.com/package/dockerdash-tui)
[![GitHub](https://img.shields.io/github/stars/mateusflorez/dockerdash-tui?style=social)](https://github.com/mateusflorez/dockerdash-tui)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A terminal UI for managing Docker containers with real-time monitoring.

```
  ╔════════════════════════════════════════════════════════════════════╗
  ║    ____             __             ____             __             ║
  ║   / __ \____  _____/ /_____  _____/ __ \____ ______/ /_            ║
  ║  / / / / __ \/ ___/ //_/ _ \/ ___/ / / / __ `/ ___/ __ \           ║
  ║ / /_/ / /_/ / /__/ ,< /  __/ /  / /_/ / /_/ (__  ) / / /           ║
  ║/_____/\____/\___/_/|_|\___/_/  /_____/\__,_/____/_/ /_/            ║
  ╚════════════════════════════════════════════════════════════════════╝
```

## Objetivo

TUI interativa para gerenciamento completo de containers Docker, oferecendo visualização em tempo real de logs e métricas, com operações rápidas de rebuild e execução.

## Features

### Container Management
- **List containers** - Visualiza todos os containers (running/stopped/all)
- **Start/Stop/Restart** - Controle rápido de containers
- **Remove containers** - Com confirmação e opção force
- **Exec shell** - Abre shell interativo no container (bash/sh)

### Real-time Monitoring
- **Live logs** - Stream de logs com follow e tail configurável
- **CPU/Memory stats** - Métricas em tempo real com gráficos ASCII
- **Network I/O** - Monitoramento de tráfego de rede
- **Auto-refresh** - Atualização automática configurável

### Build & Deploy
- **Quick rebuild** - Rebuild de imagem + recreate container
- **Build from Dockerfile** - Build com progresso visual
- **Docker Compose support** - Detecta e gerencia stacks compose

### Extras
- **Image management** - List, remove, prune images
- **Volume management** - List, inspect, remove volumes
- **Network management** - List, inspect networks
- **System prune** - Limpeza rápida de recursos não utilizados

## Menu Structure

```
┌─────────────────────────────────────────┐
│  DockerDash - Main Menu                 │
├─────────────────────────────────────────┤
│  > Containers (5 running, 2 stopped)    │
│    Images (12)                          │
│    Volumes (8)                          │
│    Networks (4)                         │
│    ──────────────────                   │
│    System Prune                         │
│    Settings                             │
│    Exit                                 │
└─────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────┐
│  Containers                                                         │
├───────────────┬──────────┬─────────┬───────────┬───────────────────┤
│ NAME          │ IMAGE    │ STATUS  │ CPU/MEM   │ PORTS             │
├───────────────┼──────────┼─────────┼───────────┼───────────────────┤
│ api-server    │ node:20  │ Up 2h   │ 2%/128MB  │ 3000->3000        │
│ postgres-db   │ postgres │ Up 2h   │ 1%/256MB  │ 5432->5432        │
│ redis-cache   │ redis    │ Up 2h   │ 0%/32MB   │ 6379->6379        │
│ nginx-proxy   │ nginx    │ Exited  │ -         │ -                 │
└───────────────┴──────────┴─────────┴───────────┴───────────────────┘
  [Enter] Actions  [L] Logs  [S] Stats  [R] Restart  [X] Stop  [Q] Back
```

```
┌─────────────────────────────────────────────────────────────────────┐
│  Stats: api-server                                          [Q] Back│
├─────────────────────────────────────────────────────────────────────┤
│  CPU Usage: 2.4%                                                    │
│  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 2.4/100%                 │
│                                                                     │
│  Memory: 128.5 MB / 512 MB                                          │
│  █████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ 25.1%                     │
│                                                                     │
│  Network I/O: 1.2 MB / 856 KB                                       │
│  Block I/O:   45 MB / 12 MB                                         │
│                                                                     │
│  PIDs: 12                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install -g dockerdash-tui
```

## Usage

```bash
dockerdash
# or
dd
```

### Options

```
  -a, --all             Show all containers (including stopped)
  -f, --filter <name>   Filter containers by name
  -h, --help            Show help message
  -v, --version         Show version
```

### Examples

```bash
dd                      # Interactive mode
dd logs api-server      # Direct log view
dd stats                # Stats dashboard for all containers
dd restart api-server   # Restart specific container
dd rebuild api-server   # Rebuild and recreate container
```

## Requirements

- Node.js 18+
- Docker Engine running
- Linux/macOS (Windows via WSL2)

## Tech Stack

| Package | Purpose |
|---------|---------|
| `dockerode` | Docker API client |
| `@inquirer/prompts` | Interactive prompts |
| `chalk` | Terminal styling |
| `cli-table3` | Table formatting |
| `ora` | Loading spinners |
| `blessed` | Terminal UI widgets (optional) |

## Project Structure

```
dockerdash-tui/
├── index.js              # Entry point, CLI parser
├── package.json
├── src/
│   ├── docker.js         # Dockerode wrapper
│   ├── containers.js     # Container operations
│   ├── images.js         # Image operations
│   ├── volumes.js        # Volume operations
│   ├── networks.js       # Network operations
│   ├── stats.js          # Real-time stats
│   ├── logs.js           # Log streaming
│   ├── ui/
│   │   ├── menu.js       # Main menu
│   │   ├── table.js      # Table renderer
│   │   ├── charts.js     # ASCII charts
│   │   └── banner.js     # ASCII art banner
│   └── utils/
│       ├── format.js     # Formatting helpers
│       └── config.js     # User preferences
└── screenshots/
```

## Roadmap

### v1.0.0 - Core
- [x] Container list with status
- [x] Start/Stop/Restart/Remove
- [x] Real-time logs
- [x] Basic stats view

### v1.1.0 - Monitoring
- [ ] Live stats dashboard
- [ ] ASCII charts for CPU/Memory
- [ ] Multi-container view
- [ ] Auto-refresh configuration

### v1.2.0 - Build
- [ ] Quick rebuild workflow
- [ ] Docker Compose detection
- [ ] Build progress visualization
- [ ] Image tagging

### v1.3.0 - Advanced
- [ ] Exec shell integration
- [ ] Volume/Network management
- [ ] System prune wizard
- [ ] Export/Import containers

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate list |
| `Enter` | Select/Action menu |
| `L` | View logs |
| `S` | View stats |
| `R` | Restart container |
| `X` | Stop container |
| `D` | Remove container |
| `Q/Esc` | Go back |
| `Ctrl+C` | Exit |

## License

MIT
