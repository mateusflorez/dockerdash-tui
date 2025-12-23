import chalk from 'chalk';
import readline from 'readline';
import { getContainer } from './docker.js';
import { showHeader } from './ui/banner.js';
import { formatBytes } from './utils/format.js';
import { progressBar, sparkline, box } from './ui/charts.js';
import renderer, { hideCursor, showCursor } from './ui/renderer.js';
import { loadConfig } from './utils/config.js';

// History for sparklines
const cpuHistory = [];
const memHistory = [];
const HISTORY_SIZE = 30;

/**
 * Show real-time container stats
 * @param {string} containerName - Container name or ID
 */
export async function showContainerStats(containerName) {
  const config = loadConfig();

  console.clear();
  showHeader(`Stats: ${containerName}`);
  console.log(chalk.gray('Press Q to exit\n'));

  hideCursor();

  const container = getContainer(containerName);

  let previousCpu = null;
  let previousSystem = null;

  // Clear history
  cpuHistory.length = 0;
  memHistory.length = 0;

  return new Promise((resolve) => {
    const statsStream = container.stats({ stream: true });

    let streamRef = null;

    const cleanup = () => {
      if (streamRef) {
        streamRef.destroy?.();
      }
      showCursor();
      renderer.reset();
      process.stdin.setRawMode?.(false);
      process.stdin.removeListener('keypress', onKeypress);
      resolve();
    };

    const onKeypress = (str, key) => {
      if (key && (key.name === 'q' || (key.ctrl && key.name === 'c'))) {
        cleanup();
      }
    };

    statsStream.then((stream) => {
      streamRef = stream;

      stream.on('data', (chunk) => {
        try {
          const stats = JSON.parse(chunk.toString());
          displayStats(containerName, stats, previousCpu, previousSystem);
          previousCpu = stats.cpu_stats.cpu_usage.total_usage;
          previousSystem = stats.cpu_stats.system_cpu_usage;
        } catch {
          // Ignore parse errors
        }
      });

      stream.on('end', cleanup);
      stream.on('error', cleanup);
    });

    // Handle user input for exit
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('keypress', onKeypress);
    }
  });
}

/**
 * Display formatted stats using flicker-free renderer
 * @param {string} containerName - Container name
 * @param {Object} stats - Docker stats object
 * @param {number} previousCpu - Previous CPU usage
 * @param {number} previousSystem - Previous system CPU usage
 */
function displayStats(containerName, stats, previousCpu, previousSystem) {
  // Calculate CPU percentage
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (previousCpu || 0);
  const systemDelta = stats.cpu_stats.system_cpu_usage - (previousSystem || 0);
  const cpuCount = stats.cpu_stats.online_cpus || 1;
  const cpuPercent = systemDelta > 0 ? Math.min(100, (cpuDelta / systemDelta) * cpuCount * 100) : 0;

  // Calculate memory
  const memUsage = stats.memory_stats.usage || 0;
  const memLimit = stats.memory_stats.limit || 1;
  const memPercent = (memUsage / memLimit) * 100;

  // Update history
  cpuHistory.push(cpuPercent);
  memHistory.push(memPercent);
  if (cpuHistory.length > HISTORY_SIZE) cpuHistory.shift();
  if (memHistory.length > HISTORY_SIZE) memHistory.shift();

  // Network I/O
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
      if (entry.op === 'read' || entry.op === 'Read') {
        blockRead += entry.value || 0;
      }
      if (entry.op === 'write' || entry.op === 'Write') {
        blockWrite += entry.value || 0;
      }
    }
  }

  // PIDs
  const pids = stats.pids_stats?.current || 0;

  // Build output
  const lines = [
    '',
    chalk.bold('  CPU Usage'),
    `  ${progressBar(cpuPercent, 40)}`,
    `  ${chalk.gray('History:')} ${sparkline(cpuHistory, { width: 30 })}`,
    '',
    chalk.bold('  Memory Usage'),
    `  ${progressBar(memPercent, 40)}`,
    `  ${chalk.cyan(formatBytes(memUsage))} / ${formatBytes(memLimit)}`,
    `  ${chalk.gray('History:')} ${sparkline(memHistory, { width: 30 })}`,
    '',
    chalk.bold('  I/O Stats'),
    `  ${chalk.gray('Network:')}  ↓ ${formatBytes(netRx).padEnd(12)} ↑ ${formatBytes(netTx)}`,
    `  ${chalk.gray('Block:  ')}  R ${formatBytes(blockRead).padEnd(12)} W ${formatBytes(blockWrite)}`,
    '',
    `  ${chalk.gray('PIDs:')} ${chalk.cyan(pids)}`,
    '',
    chalk.gray(`  Updated: ${new Date().toLocaleTimeString()}`),
  ];

  renderer.render(lines.join('\n'));
}

/**
 * Get container stats once (non-streaming)
 * @param {string} containerName - Container name or ID
 * @returns {Promise<Object>}
 */
export async function getContainerStatsOnce(containerName) {
  const container = getContainer(containerName);
  const stats = await container.stats({ stream: false });
  return stats;
}

export default { showContainerStats, getContainerStatsOnce };
