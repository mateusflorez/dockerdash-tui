import { select, confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { showBanner, showHeader, showStatus, clearScreen } from './banner.js';
import { renderContainersTable } from './table.js';
import {
  getContainers,
  getContainerCounts,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
} from '../containers.js';
import { streamLogs } from '../logs.js';
import { showContainerStats } from '../stats.js';
import { showDashboard } from '../dashboard.js';
import { loadConfig, saveConfig } from '../utils/config.js';

/**
 * Display the main menu
 */
export async function mainMenu() {
  clearScreen();
  showBanner();

  const counts = await getContainerCounts();

  const config = loadConfig();

  const choice = await select({
    message: 'DockerDash - Main Menu',
    choices: [
      {
        name: `Containers (${chalk.green(counts.running)} running, ${chalk.red(counts.stopped)} stopped)`,
        value: 'containers',
      },
      { name: `Dashboard ${chalk.gray('(live stats)')}`, value: 'dashboard' },
      { name: 'Images', value: 'images' },
      { name: 'Volumes', value: 'volumes' },
      { name: 'Networks', value: 'networks' },
      { name: chalk.gray('─────────────────────'), value: 'separator', disabled: true },
      { name: 'System Prune', value: 'prune' },
      { name: `Settings ${chalk.gray(`(refresh: ${config.refreshInterval / 1000}s)`)}`, value: 'settings' },
      { name: 'Exit', value: 'exit' },
    ],
  });

  switch (choice) {
    case 'containers':
      await containersMenu();
      break;
    case 'dashboard':
      await showDashboard();
      await mainMenu();
      break;
    case 'images':
      showStatus('Images management coming soon...', 'info');
      await pressEnterToContinue();
      await mainMenu();
      break;
    case 'volumes':
      showStatus('Volumes management coming soon...', 'info');
      await pressEnterToContinue();
      await mainMenu();
      break;
    case 'networks':
      showStatus('Networks management coming soon...', 'info');
      await pressEnterToContinue();
      await mainMenu();
      break;
    case 'prune':
      showStatus('System prune coming soon...', 'info');
      await pressEnterToContinue();
      await mainMenu();
      break;
    case 'settings':
      await settingsMenu();
      break;
    case 'exit':
      console.log(chalk.cyan('\nGoodbye!\n'));
      process.exit(0);
  }
}

/**
 * Display containers menu
 */
async function containersMenu() {
  clearScreen();
  showHeader('Containers');

  const spinner = ora('Loading containers...').start();
  const containers = await getContainers(true);
  spinner.stop();

  if (containers.length === 0) {
    showStatus('No containers found', 'warning');
    await pressEnterToContinue();
    return mainMenu();
  }

  console.log(renderContainersTable(containers));
  console.log(
    chalk.gray('\n[Enter] Actions  [L] Logs  [S] Stats  [R] Restart  [X] Stop  [Q] Back\n')
  );

  const choices = containers.map((c) => ({
    name: `${c.state === 'running' ? chalk.green('●') : chalk.red('○')} ${c.name}`,
    value: c.name,
  }));
  choices.push({ name: chalk.gray('← Back to main menu'), value: 'back' });

  const selectedContainer = await select({
    message: 'Select a container:',
    choices,
  });

  if (selectedContainer === 'back') {
    return mainMenu();
  }

  await containerActionsMenu(selectedContainer);
}

/**
 * Display container actions menu
 * @param {string} containerName - Container name
 */
async function containerActionsMenu(containerName) {
  clearScreen();
  showHeader(`Container: ${containerName}`);

  const containers = await getContainers(true);
  const container = containers.find((c) => c.name === containerName);

  if (!container) {
    showStatus('Container not found', 'error');
    await pressEnterToContinue();
    return containersMenu();
  }

  const isRunning = container.state === 'running';

  const choices = [
    { name: '📋 View Logs', value: 'logs' },
    { name: '📊 View Stats', value: 'stats' },
    { name: chalk.gray('─────────────────────'), value: 'separator', disabled: true },
  ];

  if (isRunning) {
    choices.push({ name: '🔄 Restart', value: 'restart' });
    choices.push({ name: '⏹️  Stop', value: 'stop' });
  } else {
    choices.push({ name: '▶️  Start', value: 'start' });
  }

  choices.push({ name: '🗑️  Remove', value: 'remove' });
  choices.push({ name: chalk.gray('─────────────────────'), value: 'separator2', disabled: true });
  choices.push({ name: '← Back', value: 'back' });

  const action = await select({
    message: `Actions for ${containerName}:`,
    choices,
  });

  const spinner = ora();

  switch (action) {
    case 'logs':
      await streamLogs(containerName);
      break;

    case 'stats':
      await showContainerStats(containerName);
      break;

    case 'start':
      spinner.start(`Starting ${containerName}...`);
      try {
        await startContainer(containerName);
        spinner.succeed(`Container ${containerName} started`);
      } catch (error) {
        spinner.fail(`Failed to start: ${error.message}`);
      }
      await pressEnterToContinue();
      break;

    case 'stop':
      spinner.start(`Stopping ${containerName}...`);
      try {
        await stopContainer(containerName);
        spinner.succeed(`Container ${containerName} stopped`);
      } catch (error) {
        spinner.fail(`Failed to stop: ${error.message}`);
      }
      await pressEnterToContinue();
      break;

    case 'restart':
      spinner.start(`Restarting ${containerName}...`);
      try {
        await restartContainer(containerName);
        spinner.succeed(`Container ${containerName} restarted`);
      } catch (error) {
        spinner.fail(`Failed to restart: ${error.message}`);
      }
      await pressEnterToContinue();
      break;

    case 'remove':
      const shouldForce = await confirm({
        message: 'Force remove (if running)?',
        default: false,
      });

      const confirmRemove = await confirm({
        message: `Are you sure you want to remove ${containerName}?`,
        default: false,
      });

      if (confirmRemove) {
        spinner.start(`Removing ${containerName}...`);
        try {
          await removeContainer(containerName, shouldForce);
          spinner.succeed(`Container ${containerName} removed`);
          await pressEnterToContinue();
          return containersMenu();
        } catch (error) {
          spinner.fail(`Failed to remove: ${error.message}`);
        }
      }
      await pressEnterToContinue();
      break;

    case 'back':
      return containersMenu();
  }

  await containerActionsMenu(containerName);
}

/**
 * Wait for user to press Enter
 */
async function pressEnterToContinue() {
  await select({
    message: 'Press Enter to continue...',
    choices: [{ name: 'Continue', value: 'continue' }],
  });
}

/**
 * Display settings menu
 */
async function settingsMenu() {
  clearScreen();
  showHeader('Settings');

  const config = loadConfig();

  const choice = await select({
    message: 'Configure DockerDash:',
    choices: [
      {
        name: `Refresh Interval: ${chalk.cyan(config.refreshInterval / 1000 + 's')}`,
        value: 'refresh',
      },
      {
        name: `Log Tail Lines: ${chalk.cyan(config.logTail)}`,
        value: 'logTail',
      },
      {
        name: `Show All Containers: ${chalk.cyan(config.showAllContainers ? 'Yes' : 'No')}`,
        value: 'showAll',
      },
      { name: chalk.gray('─────────────────────'), value: 'separator', disabled: true },
      { name: '← Back', value: 'back' },
    ],
  });

  switch (choice) {
    case 'refresh':
      const interval = await select({
        message: 'Select refresh interval:',
        choices: [
          { name: '1 second', value: 1000 },
          { name: '2 seconds (default)', value: 2000 },
          { name: '3 seconds', value: 3000 },
          { name: '5 seconds', value: 5000 },
          { name: '10 seconds', value: 10000 },
        ],
      });
      config.refreshInterval = interval;
      saveConfig(config);
      showStatus(`Refresh interval set to ${interval / 1000}s`, 'success');
      await pressEnterToContinue();
      await settingsMenu();
      break;

    case 'logTail':
      const tailInput = await input({
        message: 'Number of log lines to tail:',
        default: String(config.logTail),
        validate: (value) => {
          const num = parseInt(value, 10);
          if (isNaN(num) || num < 10 || num > 1000) {
            return 'Enter a number between 10 and 1000';
          }
          return true;
        },
      });
      config.logTail = parseInt(tailInput, 10);
      saveConfig(config);
      showStatus(`Log tail set to ${config.logTail} lines`, 'success');
      await pressEnterToContinue();
      await settingsMenu();
      break;

    case 'showAll':
      config.showAllContainers = !config.showAllContainers;
      saveConfig(config);
      showStatus(
        `Show all containers: ${config.showAllContainers ? 'enabled' : 'disabled'}`,
        'success'
      );
      await pressEnterToContinue();
      await settingsMenu();
      break;

    case 'back':
      await mainMenu();
      break;
  }
}

export default { mainMenu };
