import chalk from 'chalk';
import readline from 'readline';
import { getContainer } from './docker.js';
import { showHeader, clearScreen } from './ui/banner.js';
import { formatBytes, createProgressBar } from './utils/format.js';

/**
 * Show real-time container stats
 * @param {string} containerName - Container name or ID
 */
export async function showContainerStats(containerName) {
  clearScreen();
  showHeader(`Stats: ${containerName}`);
  console.log(chalk.gray('Press Ctrl+C or Q to exit\n'));

  const container = getContainer(containerName);

  let previousCpu = null;
  let previousSystem = null;

  return new Promise((resolve) => {
    const statsStream = container.stats({ stream: true });

    let streamRef = null;

    const cleanup = () => {
      if (streamRef) {
        streamRef.destroy?.();
      }
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
 * Display formatted stats
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
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

  // Calculate memory
  const memUsage = stats.memory_stats.usage || 0;
  const memLimit = stats.memory_stats.limit || 1;
  const memPercent = (memUsage / memLimit) * 100;

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

  // Clear and redraw
  process.stdout.write('\x1B[2J\x1B[0f');
  showHeader(`Stats: ${containerName}`);
  console.log(chalk.gray('Press Q to go back\n'));

  // CPU
  console.log(chalk.bold('  CPU Usage: ') + chalk.cyan(`${cpuPercent.toFixed(2)}%`));
  console.log(`  ${createColoredBar(cpuPercent)} ${cpuPercent.toFixed(1)}%`);
  console.log();

  // Memory
  console.log(
    chalk.bold('  Memory: ') + chalk.cyan(`${formatBytes(memUsage)} / ${formatBytes(memLimit)}`)
  );
  console.log(`  ${createColoredBar(memPercent)} ${memPercent.toFixed(1)}%`);
  console.log();

  // Network
  console.log(
    chalk.bold('  Network I/O: ') + chalk.cyan(`${formatBytes(netRx)} / ${formatBytes(netTx)}`)
  );

  // Block I/O
  console.log(
    chalk.bold('  Block I/O:   ') +
      chalk.cyan(`${formatBytes(blockRead)} / ${formatBytes(blockWrite)}`)
  );
  console.log();

  // PIDs
  console.log(chalk.bold('  PIDs: ') + chalk.cyan(pids));
}

/**
 * Create a colored progress bar based on percentage
 * @param {number} percent - Percentage (0-100)
 * @returns {string}
 */
function createColoredBar(percent) {
  const width = 40;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  let color = chalk.green;
  if (percent > 80) {
    color = chalk.red;
  } else if (percent > 60) {
    color = chalk.yellow;
  }

  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
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
