import chalk from 'chalk';
import readline from 'readline';
import { listContainers } from './docker.js';
import { getContainer } from './docker.js';
import { formatBytes } from './utils/format.js';
import { loadConfig } from './utils/config.js';
import { progressBar, sparkline, box } from './ui/charts.js';
import renderer, { hideCursor, showCursor, getTerminalSize } from './ui/renderer.js';

/**
 * Container stats history for sparklines
 */
const statsHistory = new Map();
const HISTORY_SIZE = 20;

/**
 * Add stats to history
 * @param {string} containerId - Container ID
 * @param {Object} stats - Stats object
 */
function addToHistory(containerId, stats) {
  if (!statsHistory.has(containerId)) {
    statsHistory.set(containerId, { cpu: [], mem: [] });
  }

  const history = statsHistory.get(containerId);
  history.cpu.push(stats.cpuPercent);
  history.mem.push(stats.memPercent);

  // Keep only last N entries
  if (history.cpu.length > HISTORY_SIZE) history.cpu.shift();
  if (history.mem.length > HISTORY_SIZE) history.mem.shift();
}

/**
 * Calculate container stats from Docker stats object
 * @param {Object} stats - Raw Docker stats
 * @param {Object} prev - Previous stats for delta calculation
 * @returns {Object}
 */
function calculateStats(stats, prev = {}) {
  // CPU
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (prev.cpuTotal || 0);
  const systemDelta = stats.cpu_stats.system_cpu_usage - (prev.systemCpu || 0);
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

  // Memory
  const memUsage = stats.memory_stats.usage || 0;
  const memLimit = stats.memory_stats.limit || 1;
  const memPercent = (memUsage / memLimit) * 100;

  // Network
  let netRx = 0;
  let netTx = 0;
  if (stats.networks) {
    for (const iface of Object.values(stats.networks)) {
      netRx += iface.rx_bytes || 0;
      netTx += iface.tx_bytes || 0;
    }
  }

  // Block I/O
  let blockRead = 0;
  let blockWrite = 0;
  if (stats.blkio_stats?.io_service_bytes_recursive) {
    for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
      if (entry.op === 'read' || entry.op === 'Read') blockRead += entry.value || 0;
      if (entry.op === 'write' || entry.op === 'Write') blockWrite += entry.value || 0;
    }
  }

  return {
    cpuPercent: Math.min(100, cpuPercent),
    memUsage,
    memLimit,
    memPercent,
    netRx,
    netTx,
    blockRead,
    blockWrite,
    pids: stats.pids_stats?.current || 0,
    cpuTotal: stats.cpu_stats.cpu_usage.total_usage,
    systemCpu: stats.cpu_stats.system_cpu_usage,
  };
}

/**
 * Render a single container stats box
 * @param {string} name - Container name
 * @param {Object} stats - Calculated stats
 * @param {number} width - Box width
 * @returns {string}
 */
function renderContainerBox(name, stats, width = 50) {
  const history = statsHistory.get(name) || { cpu: [], mem: [] };

  const lines = [
    `${chalk.cyan('CPU')}  ${progressBar(stats.cpuPercent, 20)} ${sparkline(history.cpu, { width: 10 })}`,
    `${chalk.cyan('MEM')}  ${progressBar(stats.memPercent, 20)} ${formatBytes(stats.memUsage).padStart(10)}`,
    `${chalk.gray('NET')}  ↓ ${formatBytes(stats.netRx).padEnd(10)} ↑ ${formatBytes(stats.netTx).padEnd(10)}`,
    `${chalk.gray('I/O')}  R ${formatBytes(stats.blockRead).padEnd(10)} W ${formatBytes(stats.blockWrite).padEnd(10)}`,
  ];

  return box(name.substring(0, 20), lines, width);
}

/**
 * Show multi-container dashboard
 */
export async function showDashboard() {
  const config = loadConfig();
  const refreshInterval = config.refreshInterval;

  console.clear();
  console.log(chalk.cyan.bold('\n  DockerDash - Live Dashboard'));
  console.log(chalk.gray('  Press Q to exit | R to refresh now\n'));

  hideCursor();

  const containers = await listContainers(false); // Only running containers

  if (containers.length === 0) {
    showCursor();
    console.log(chalk.yellow('  No running containers found.\n'));
    return;
  }

  // Store streams and previous stats
  const streams = new Map();
  const prevStats = new Map();
  const currentStats = new Map();
  let isRunning = true;

  // Setup keyboard input
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  const cleanup = () => {
    isRunning = false;
    showCursor();
    renderer.reset();

    for (const stream of streams.values()) {
      stream.destroy?.();
    }
    streams.clear();

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeListener('keypress', onKeypress);
  };

  const onKeypress = (str, key) => {
    if (key && (key.name === 'q' || (key.ctrl && key.name === 'c'))) {
      cleanup();
    }
  };

  process.stdin.on('keypress', onKeypress);
  process.stdin.resume();

  // Start stats streams for each container
  for (const containerInfo of containers) {
    const container = getContainer(containerInfo.Id);
    const name = containerInfo.Names[0].replace(/^\//, '');

    container.stats({ stream: true }).then((stream) => {
      streams.set(name, stream);

      stream.on('data', (chunk) => {
        try {
          const rawStats = JSON.parse(chunk.toString());
          const prev = prevStats.get(name) || {};
          const stats = calculateStats(rawStats, prev);

          prevStats.set(name, stats);
          currentStats.set(name, stats);
          addToHistory(name, stats);
        } catch {
          // Ignore parse errors
        }
      });

      stream.on('error', () => {
        streams.delete(name);
      });
    });
  }

  // Render loop
  const render = () => {
    if (!isRunning) return;

    const { cols } = getTerminalSize();
    const boxWidth = Math.min(55, Math.floor(cols / 2) - 2);
    const boxes = [];

    for (const containerInfo of containers) {
      const name = containerInfo.Names[0].replace(/^\//, '');
      const stats = currentStats.get(name);

      if (stats) {
        boxes.push(renderContainerBox(name, stats, boxWidth));
      } else {
        boxes.push(box(name.substring(0, 20), [chalk.gray('Loading...')], boxWidth));
      }
    }

    // Arrange boxes in grid (2 columns if space allows)
    let output = '';
    if (cols >= 110 && boxes.length > 1) {
      // Two column layout
      for (let i = 0; i < boxes.length; i += 2) {
        const left = boxes[i].split('\n');
        const right = boxes[i + 1]?.split('\n') || [];

        const maxLines = Math.max(left.length, right.length);
        for (let j = 0; j < maxLines; j++) {
          const leftLine = left[j] || ' '.repeat(boxWidth);
          const rightLine = right[j] || '';
          output += `  ${leftLine}  ${rightLine}\n`;
        }
        output += '\n';
      }
    } else {
      // Single column layout
      output = boxes.map((b) => b.split('\n').map((l) => `  ${l}`).join('\n')).join('\n\n');
    }

    const timestamp = new Date().toLocaleTimeString();
    output += `\n  ${chalk.gray(`Last update: ${timestamp} | Refresh: ${refreshInterval / 1000}s`)}`;

    renderer.render(output);
  };

  // Initial render after short delay to collect first stats
  setTimeout(render, 500);

  // Continuous render
  const renderLoop = setInterval(() => {
    if (isRunning) render();
  }, refreshInterval);

  // Wait for exit
  return new Promise((resolve) => {
    const checkExit = setInterval(() => {
      if (!isRunning) {
        clearInterval(renderLoop);
        clearInterval(checkExit);
        console.log('\n');
        resolve();
      }
    }, 100);
  });
}

export default { showDashboard };
