import { select, confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { showBanner, showHeader, showStatus, clearScreen } from './banner.js';
import { renderContainersTable, renderImagesTable } from './table.js';
import { renderBuildProgress, renderBuildResult, BuildProgressTracker } from './build-progress.js';
import {
  getContainers,
  getContainerCounts,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  inspectContainer,
} from '../containers.js';
import { streamLogs } from '../logs.js';
import { showContainerStats } from '../stats.js';
import { showDashboard } from '../dashboard.js';
import { loadConfig, saveConfig } from '../utils/config.js';
import {
  quickRebuild,
  getImages,
  removeImage,
  tagImage,
  buildImage,
  pruneImages,
  inspectImage,
} from '../images.js';
import { getComposeInfo, composeRebuild } from '../compose.js';

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
      await imagesMenu();
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

  const containers = await getContainers(true);
  const container = containers.find((c) => c.name === containerName);

  if (!container) {
    showStatus('Container not found', 'error');
    await pressEnterToContinue();
    return containersMenu();
  }

  // Check if compose container
  const fullInfo = await inspectContainer(containerName);
  const composeInfo = getComposeInfo({ Labels: fullInfo.Config.Labels });

  const headerText = composeInfo
    ? `Container: ${containerName} ${chalk.gray(`[${composeInfo.projectName}/${composeInfo.serviceName}]`)}`
    : `Container: ${containerName}`;

  showHeader(headerText);

  if (composeInfo) {
    console.log(chalk.gray(`  Compose Project: ${composeInfo.projectName}`));
    console.log(chalk.gray(`  Service: ${composeInfo.serviceName}`));
    console.log(chalk.gray(`  Working Dir: ${composeInfo.workingDir}\n`));
  }

  const isRunning = container.state === 'running';

  const choices = [
    { name: '📋 View Logs', value: 'logs' },
    { name: '📊 View Stats', value: 'stats' },
    { name: chalk.gray('─────────────────────'), value: 'separator', disabled: true },
    { name: `🔨 Rebuild ${chalk.gray('(rebuild image + recreate)')}`, value: 'rebuild' },
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

    case 'rebuild':
      const useNoCache = await confirm({
        message: 'Build without cache?',
        default: false,
      });

      const confirmRebuild = await confirm({
        message: `Rebuild ${containerName}? This will stop, rebuild, and recreate the container.`,
        default: true,
      });

      if (confirmRebuild) {
        console.log(''); // Empty line
        spinner.start('Rebuilding container...');

        try {
          const result = await quickRebuild(containerName, {
            noCache: useNoCache,
            onOutput: (msg) => {
              spinner.text = msg.trim().substring(0, 60);
            },
          });

          if (result.success) {
            spinner.succeed(`Container ${containerName} rebuilt successfully`);
            if (result.method === 'compose') {
              showStatus(`Used Docker Compose (${result.project}/${result.service})`, 'info');
            }
          } else {
            spinner.fail(`Rebuild failed: ${result.error}`);
          }
        } catch (error) {
          spinner.fail(`Rebuild failed: ${error.message}`);
        }
      }
      await pressEnterToContinue();
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
 * Display images menu
 */
async function imagesMenu() {
  clearScreen();
  showHeader('Images');

  const spinner = ora('Loading images...').start();
  const images = await getImages();
  spinner.stop();

  if (images.length === 0) {
    showStatus('No images found', 'warning');
    await pressEnterToContinue();
    return mainMenu();
  }

  console.log(renderImagesTable(images));
  console.log(
    chalk.gray('\n[Enter] Actions  [T] Tag  [D] Delete  [B] Build  [Q] Back\n')
  );

  const choices = images.map((img) => ({
    name: `${img.repository}:${img.tag} ${chalk.gray(`(${img.size})`)}`,
    value: { id: img.id, name: `${img.repository}:${img.tag}` },
  }));

  choices.push({ name: chalk.cyan('+ Build new image'), value: 'build' });
  choices.push({ name: chalk.yellow('🧹 Prune unused images'), value: 'prune' });
  choices.push({ name: chalk.gray('← Back to main menu'), value: 'back' });

  const selected = await select({
    message: 'Select an image:',
    choices,
  });

  if (selected === 'back') {
    return mainMenu();
  }

  if (selected === 'build') {
    await buildImageMenu();
    return;
  }

  if (selected === 'prune') {
    await pruneImagesMenu();
    return;
  }

  await imageActionsMenu(selected);
}

/**
 * Display image actions menu
 * @param {Object} imageInfo - Image info { id, name }
 */
async function imageActionsMenu(imageInfo) {
  clearScreen();
  showHeader(`Image: ${imageInfo.name}`);

  const spinner = ora('Loading image details...').start();
  let imageDetails;
  try {
    imageDetails = await inspectImage(imageInfo.id);
    spinner.stop();

    console.log(chalk.gray(`  ID: ${imageInfo.id}`));
    console.log(chalk.gray(`  Created: ${new Date(imageDetails.Created).toLocaleString()}`));
    console.log(chalk.gray(`  Architecture: ${imageDetails.Architecture}`));
    console.log(chalk.gray(`  OS: ${imageDetails.Os}`));
    if (imageDetails.RepoTags?.length > 1) {
      console.log(chalk.gray(`  Tags: ${imageDetails.RepoTags.join(', ')}`));
    }
    console.log('');
  } catch {
    spinner.stop();
  }

  const choices = [
    { name: '🏷️  Add Tag', value: 'tag' },
    { name: '🔍 Inspect', value: 'inspect' },
    { name: chalk.gray('─────────────────────'), value: 'separator', disabled: true },
    { name: '🗑️  Remove', value: 'remove' },
    { name: chalk.gray('─────────────────────'), value: 'separator2', disabled: true },
    { name: '← Back', value: 'back' },
  ];

  const action = await select({
    message: `Actions for ${imageInfo.name}:`,
    choices,
  });

  const spinnerAction = ora();

  switch (action) {
    case 'tag':
      const newTag = await input({
        message: 'Enter new tag (e.g., myapp:v2.0 or myregistry/myapp:latest):',
        validate: (value) => {
          if (!value.trim()) return 'Tag cannot be empty';
          if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/:]*$/.test(value)) {
            return 'Invalid tag format';
          }
          return true;
        },
      });

      spinnerAction.start(`Tagging ${imageInfo.name} as ${newTag}...`);
      try {
        await tagImage(imageInfo.name, newTag);
        spinnerAction.succeed(`Image tagged as ${newTag}`);
      } catch (error) {
        spinnerAction.fail(`Failed to tag: ${error.message}`);
      }
      await pressEnterToContinue();
      break;

    case 'inspect':
      clearScreen();
      showHeader(`Inspect: ${imageInfo.name}`);

      try {
        const details = await inspectImage(imageInfo.id);
        console.log(chalk.bold('\nImage Details:\n'));
        console.log(chalk.gray('ID:'), details.Id.replace('sha256:', '').substring(0, 12));
        console.log(chalk.gray('Created:'), new Date(details.Created).toLocaleString());
        console.log(chalk.gray('Size:'), `${(details.Size / 1024 / 1024).toFixed(2)} MB`);
        console.log(chalk.gray('Architecture:'), details.Architecture);
        console.log(chalk.gray('OS:'), details.Os);

        if (details.RepoTags?.length > 0) {
          console.log(chalk.bold('\nTags:'));
          for (const tag of details.RepoTags) {
            console.log(chalk.cyan(`  ${tag}`));
          }
        }

        if (details.Config?.Env?.length > 0) {
          console.log(chalk.bold('\nEnvironment Variables:'));
          for (const env of details.Config.Env.slice(0, 10)) {
            console.log(chalk.gray(`  ${env}`));
          }
          if (details.Config.Env.length > 10) {
            console.log(chalk.gray(`  ... and ${details.Config.Env.length - 10} more`));
          }
        }

        if (details.Config?.ExposedPorts) {
          console.log(chalk.bold('\nExposed Ports:'));
          for (const port of Object.keys(details.Config.ExposedPorts)) {
            console.log(chalk.gray(`  ${port}`));
          }
        }
      } catch (error) {
        console.log(chalk.red(`Error: ${error.message}`));
      }

      await pressEnterToContinue();
      break;

    case 'remove':
      const confirmRemove = await confirm({
        message: `Are you sure you want to remove ${imageInfo.name}?`,
        default: false,
      });

      if (confirmRemove) {
        const force = await confirm({
          message: 'Force remove (even if used by containers)?',
          default: false,
        });

        spinnerAction.start(`Removing ${imageInfo.name}...`);
        try {
          await removeImage(imageInfo.name, force);
          spinnerAction.succeed(`Image ${imageInfo.name} removed`);
          await pressEnterToContinue();
          return imagesMenu();
        } catch (error) {
          spinnerAction.fail(`Failed to remove: ${error.message}`);
        }
      }
      await pressEnterToContinue();
      break;

    case 'back':
      return imagesMenu();
  }

  await imageActionsMenu(imageInfo);
}

/**
 * Build image menu with progress visualization
 */
async function buildImageMenu() {
  clearScreen();
  showHeader('Build Image');

  const context = await input({
    message: 'Build context path (e.g., . or ./app):',
    default: '.',
    validate: (value) => {
      if (!value.trim()) return 'Path cannot be empty';
      return true;
    },
  });

  const dockerfile = await input({
    message: 'Dockerfile path (relative to context):',
    default: 'Dockerfile',
  });

  const imageTag = await input({
    message: 'Image tag (e.g., myapp:latest):',
    validate: (value) => {
      if (!value.trim()) return 'Tag cannot be empty';
      return true;
    },
  });

  const noCache = await confirm({
    message: 'Build without cache?',
    default: false,
  });

  const confirmBuild = await confirm({
    message: `Build image ${imageTag} from ${context}?`,
    default: true,
  });

  if (!confirmBuild) {
    return imagesMenu();
  }

  clearScreen();
  showHeader(`Building: ${imageTag}`);
  console.log('');

  let lastRender = '';
  const updateInterval = setInterval(() => {
    // Placeholder for continuous updates
  }, 100);

  try {
    const result = await buildImage(context, {
      dockerfile,
      tag: imageTag,
      noCache,
      onProgress: (tracker) => {
        const rendered = renderBuildProgress(tracker);
        if (rendered !== lastRender) {
          clearScreen();
          showHeader(`Building: ${imageTag}`);
          console.log('');
          console.log(rendered);
          lastRender = rendered;
        }
      },
      onOutput: () => {},
    });

    clearInterval(updateInterval);
    clearScreen();
    showHeader(`Build: ${imageTag}`);
    console.log('');

    if (result.code === 0) {
      console.log(renderBuildResult(result.tracker, true));
      showStatus('Build completed successfully!', 'success');
    } else {
      console.log(renderBuildResult(result.tracker, false));
      showStatus('Build failed!', 'error');
    }
  } catch (error) {
    clearInterval(updateInterval);
    showStatus(`Build error: ${error.message}`, 'error');
  }

  await pressEnterToContinue();
  return imagesMenu();
}

/**
 * Prune unused images
 */
async function pruneImagesMenu() {
  const confirmPrune = await confirm({
    message: 'Remove all unused (dangling) images?',
    default: false,
  });

  if (!confirmPrune) {
    return imagesMenu();
  }

  const spinner = ora('Pruning unused images...').start();
  try {
    const result = await pruneImages();
    const spaceReclaimed = result.SpaceReclaimed || 0;
    const count = result.ImagesDeleted?.length || 0;

    spinner.succeed(`Pruned ${count} images, reclaimed ${(spaceReclaimed / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    spinner.fail(`Prune failed: ${error.message}`);
  }

  await pressEnterToContinue();
  return imagesMenu();
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
