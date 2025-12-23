import chalk from 'chalk';
import readline from 'readline';
import { getContainer } from './docker.js';
import { showHeader, clearScreen } from './ui/banner.js';

/**
 * Stream container logs
 * @param {string} containerName - Container name or ID
 * @param {Object} options - Log options
 * @param {number} options.tail - Number of lines to tail
 * @param {boolean} options.follow - Follow log output
 * @param {boolean} options.timestamps - Show timestamps
 */
export async function streamLogs(containerName, options = {}) {
  const { tail = 100, follow = true, timestamps = true } = options;

  clearScreen();
  showHeader(`Logs: ${containerName}`);
  console.log(chalk.gray('Press Ctrl+C to exit\n'));

  const container = getContainer(containerName);

  const stream = await container.logs({
    follow,
    stdout: true,
    stderr: true,
    tail,
    timestamps,
  });

  return new Promise((resolve) => {
    const onData = (chunk) => {
      const lines = chunk.toString('utf8').split('\n');
      for (const line of lines) {
        if (line.trim()) {
          // Remove Docker stream header (first 8 bytes)
          const cleanLine = line.length > 8 ? line.substring(8) : line;
          formatLogLine(cleanLine);
        }
      }
    };

    const cleanup = () => {
      stream.removeListener('data', onData);
      stream.destroy?.();
      process.stdin.setRawMode?.(false);
      process.stdin.removeListener('keypress', onKeypress);
      resolve();
    };

    const onKeypress = (str, key) => {
      if (key && (key.name === 'q' || (key.ctrl && key.name === 'c'))) {
        cleanup();
      }
    };

    // Handle stream events
    stream.on('data', onData);
    stream.on('end', cleanup);
    stream.on('error', (err) => {
      console.error(chalk.red(`Error streaming logs: ${err.message}`));
      cleanup();
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
 * Format and print a log line
 * @param {string} line - Log line
 */
function formatLogLine(line) {
  // Try to parse timestamp
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s*(.*)$/);

  if (timestampMatch) {
    const timestamp = new Date(timestampMatch[1]).toLocaleTimeString();
    const message = timestampMatch[2];
    console.log(`${chalk.gray(timestamp)} ${colorizeLogLevel(message)}`);
  } else {
    console.log(colorizeLogLevel(line));
  }
}

/**
 * Colorize log line based on log level
 * @param {string} message - Log message
 * @returns {string}
 */
function colorizeLogLevel(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('error') || lowerMessage.includes('fatal')) {
    return chalk.red(message);
  }
  if (lowerMessage.includes('warn')) {
    return chalk.yellow(message);
  }
  if (lowerMessage.includes('info')) {
    return chalk.blue(message);
  }
  if (lowerMessage.includes('debug')) {
    return chalk.gray(message);
  }
  if (lowerMessage.includes('success')) {
    return chalk.green(message);
  }

  return message;
}

/**
 * Get container logs without streaming
 * @param {string} containerName - Container name or ID
 * @param {number} tail - Number of lines to return
 * @returns {Promise<string>}
 */
export async function getLogs(containerName, tail = 100) {
  const container = getContainer(containerName);

  const logs = await container.logs({
    follow: false,
    stdout: true,
    stderr: true,
    tail,
    timestamps: true,
  });

  return logs.toString('utf8');
}

export default { streamLogs, getLogs };
