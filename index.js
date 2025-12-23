#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { isDockerRunning } from './src/docker.js';
import { mainMenu } from './src/ui/menu.js';
import { showBanner, showStatus } from './src/ui/banner.js';
import { streamLogs } from './src/logs.js';
import { showContainerStats } from './src/stats.js';
import { showDashboard } from './src/dashboard.js';
import {
  getContainers,
  startContainer,
  stopContainer,
  restartContainer,
} from './src/containers.js';
import { renderContainersTable } from './src/ui/table.js';
import { quickRebuild } from './src/images.js';

const VERSION = '1.0.0';

// Handle graceful exit on SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log(chalk.cyan('\n\nGoodbye!\n'));
  process.exit(0);
});

// Handle uncaught exceptions from Inquirer prompts
process.on('uncaughtException', (error) => {
  if (error.name === 'ExitPromptError') {
    console.log(chalk.cyan('\n\nGoodbye!\n'));
    process.exit(0);
  }
  console.error(chalk.red('\nUnexpected error:'), error.message);
  process.exit(1);
});

program
  .name('dockerdash')
  .description('A terminal UI for managing Docker containers with real-time monitoring')
  .version(VERSION, '-v, --version', 'Show version');

program
  .option('-a, --all', 'Show all containers (including stopped)', true)
  .option('-f, --filter <name>', 'Filter containers by name')
  .action(async (options) => {
    await checkDocker();
    await mainMenu();
  });

program
  .command('list')
  .alias('ls')
  .description('List all containers')
  .option('-a, --all', 'Show all containers', true)
  .action(async (options) => {
    await checkDocker();
    const spinner = ora('Loading containers...').start();
    const containers = await getContainers(options.all);
    spinner.stop();

    if (containers.length === 0) {
      showStatus('No containers found', 'warning');
      return;
    }

    console.log(renderContainersTable(containers));
  });

program
  .command('logs <container>')
  .description('View container logs')
  .option('-f, --follow', 'Follow log output', true)
  .option('-t, --tail <lines>', 'Number of lines to show', '100')
  .action(async (container, options) => {
    await checkDocker();
    await streamLogs(container, {
      follow: options.follow,
      tail: parseInt(options.tail, 10),
    });
  });

program
  .command('stats [container]')
  .description('View container stats')
  .action(async (container) => {
    await checkDocker();
    if (container) {
      await showContainerStats(container);
    } else {
      await showDashboard();
    }
  });

program
  .command('dashboard')
  .alias('dash')
  .description('Show live stats dashboard for all running containers')
  .action(async () => {
    await checkDocker();
    await showDashboard();
  });

program
  .command('start <container>')
  .description('Start a container')
  .action(async (container) => {
    await checkDocker();
    const spinner = ora(`Starting ${container}...`).start();
    try {
      await startContainer(container);
      spinner.succeed(`Container ${container} started`);
    } catch (error) {
      spinner.fail(`Failed to start: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('stop <container>')
  .description('Stop a container')
  .action(async (container) => {
    await checkDocker();
    const spinner = ora(`Stopping ${container}...`).start();
    try {
      await stopContainer(container);
      spinner.succeed(`Container ${container} stopped`);
    } catch (error) {
      spinner.fail(`Failed to stop: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('restart <container>')
  .description('Restart a container')
  .action(async (container) => {
    await checkDocker();
    const spinner = ora(`Restarting ${container}...`).start();
    try {
      await restartContainer(container);
      spinner.succeed(`Container ${container} restarted`);
    } catch (error) {
      spinner.fail(`Failed to restart: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('rebuild <container>')
  .description('Rebuild container (stop, rebuild image, recreate)')
  .option('--no-cache', 'Build without cache')
  .action(async (container, options) => {
    await checkDocker();
    const spinner = ora(`Rebuilding ${container}...`).start();

    try {
      const result = await quickRebuild(container, {
        noCache: options.cache === false,
        onOutput: (msg) => {
          spinner.text = msg.trim().substring(0, 60);
        },
      });

      if (result.success) {
        spinner.succeed(`Container ${container} rebuilt successfully`);
        if (result.method === 'compose') {
          console.log(chalk.gray(`  Used Docker Compose (${result.project}/${result.service})`));
        }
      } else {
        spinner.fail(`Rebuild failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`Failed to rebuild: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Check if Docker is running
 */
async function checkDocker() {
  const spinner = ora('Connecting to Docker...').start();

  const dockerRunning = await isDockerRunning();

  if (!dockerRunning) {
    spinner.fail('Docker is not running');
    console.log(chalk.red('\nPlease make sure Docker daemon is running.'));
    console.log(chalk.gray('Try: sudo systemctl start docker'));
    process.exit(1);
  }

  spinner.succeed('Connected to Docker');
}

// Parse arguments
program.parse();
