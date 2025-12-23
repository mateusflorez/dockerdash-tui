import chalk from 'chalk';

const BANNER = `
╔════════════════════════════════════════════════════════════════════╗
║    ____             __             ____             __             ║
║   / __ \\____  _____/ /_____  _____/ __ \\____ ______/ /_            ║
║  / / / / __ \\/ ___/ //_/ _ \\/ ___/ / / / __ \`/ ___/ __ \\           ║
║ / /_/ / /_/ / /__/ ,< /  __/ /  / /_/ / /_/ (__  ) / / /           ║
║/_____/\\____/\\___/_/|_|\\___/_/  /_____/\\__,_/____/_/ /_/            ║
╚════════════════════════════════════════════════════════════════════╝
`;

/**
 * Display the banner
 */
export function showBanner() {
  console.log(chalk.cyan(BANNER));
}

/**
 * Display a section header
 * @param {string} title - Section title
 */
export function showHeader(title) {
  const line = '─'.repeat(60);
  console.log(chalk.cyan(`\n┌${line}┐`));
  console.log(chalk.cyan(`│ ${chalk.bold(title.padEnd(58))} │`));
  console.log(chalk.cyan(`└${line}┘\n`));
}

/**
 * Display a status message
 * @param {string} message - Message to display
 * @param {'info' | 'success' | 'warning' | 'error'} type - Message type
 */
export function showStatus(message, type = 'info') {
  const colors = {
    info: chalk.blue,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
  };
  const icons = {
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
    error: '✕',
  };

  console.log(colors[type](`${icons[type]} ${message}`));
}

/**
 * Clear the console
 */
export function clearScreen() {
  console.clear();
}

export default { showBanner, showHeader, showStatus, clearScreen };
