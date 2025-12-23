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

## Features

- **Container Management** - List, start, stop, restart, and remove containers
- **Real-time Logs** - Stream container logs with syntax highlighting
- **Live Stats** - Monitor CPU, memory, network, and block I/O in real-time
- **Interactive UI** - Navigate with keyboard shortcuts
- **Docker Desktop Support** - Auto-detects Docker socket location

## Installation

```bash
npm install -g dockerdash-tui
```

## Usage

```bash
# Interactive mode
dockerdash
# or
dd

# Direct commands
dd list                 # List all containers
dd logs <container>     # View container logs
dd stats <container>    # View container stats
dd start <container>    # Start a container
dd stop <container>     # Stop a container
dd restart <container>  # Restart a container
```

### Options

```
-a, --all             Show all containers (including stopped)
-f, --filter <name>   Filter containers by name
-h, --help            Show help message
-v, --version         Show version
```

## Screenshots

### Container List
```
┌───┬────────────────────┬────────────────────┬───────────────┬─────────────────────────┐
│   │ NAME               │ IMAGE              │ STATUS        │ PORTS                   │
├───┼────────────────────┼────────────────────┼───────────────┼─────────────────────────┤
│ ● │ api-server         │ node:20            │ Up 2 hours    │ 3000->3000              │
│ ● │ postgres-db        │ postgres           │ Up 2 hours    │ 5432->5432              │
│ ○ │ nginx-proxy        │ nginx              │ Exited        │ -                       │
└───┴────────────────────┴────────────────────┴───────────────┴─────────────────────────┘
```

### Stats View
```
┌────────────────────────────────────────────────────────────────────┐
│  Stats: api-server                                                 │
├────────────────────────────────────────────────────────────────────┤
│  CPU Usage: 2.4%                                                   │
│  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 2.4%                    │
│                                                                    │
│  Memory: 128.5 MB / 512 MB                                         │
│  █████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ 25.1%                   │
│                                                                    │
│  Network I/O: 1.2 MB / 856 KB                                      │
│  Block I/O:   45 MB / 12 MB                                        │
│  PIDs: 12                                                          │
└────────────────────────────────────────────────────────────────────┘
```

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
| `commander` | CLI argument parsing |

## License

MIT
