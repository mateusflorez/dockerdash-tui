import { select, confirm, input, Separator } from '@inquirer/prompts';
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
  detectShell,
  openInteractiveShell,
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
import {
  getVolumes,
  inspectVolume,
  createVolume,
  removeVolume,
  pruneVolumes,
  getVolumeContainers,
} from '../volumes.js';
import {
  getNetworks,
  inspectNetwork,
  createNetwork,
  removeNetwork,
  pruneNetworks,
  getNetworkContainers,
  isSystemNetwork,
} from '../networks.js';
import { renderVolumesTable, renderNetworksTable } from './table.js';
import {
  getDiskUsage,
  pruneContainers as dockerPruneContainers,
  pruneImages as dockerPruneImages,
  pruneVolumes as dockerPruneVolumes,
  pruneNetworks as dockerPruneNetworks,
  pruneBuildCache,
} from '../docker.js';
import { formatBytes } from '../utils/format.js';
import { progressBar } from './charts.js';

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
      new Separator(),
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
      await volumesMenu();
      break;
    case 'networks':
      await networksMenu();
      break;
    case 'prune':
      await systemPruneWizard();
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
  ];

  if (isRunning) {
    choices.push({ name: '💻 Exec Shell', value: 'exec' });
  }

  choices.push(new Separator());
  choices.push({ name: `🔨 Rebuild ${chalk.gray('(rebuild image + recreate)')}`, value: 'rebuild' });

  if (isRunning) {
    choices.push({ name: '🔄 Restart', value: 'restart' });
    choices.push({ name: '⏹️  Stop', value: 'stop' });
  } else {
    choices.push({ name: '▶️  Start', value: 'start' });
  }

  choices.push({ name: '🗑️  Remove', value: 'remove' });
  choices.push(new Separator());
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

    case 'exec':
      const shellChoice = await select({
        message: 'Select shell:',
        choices: [
          { name: '/bin/bash (if available)', value: 'bash' },
          { name: '/bin/sh (fallback)', value: 'sh' },
          { name: 'Auto-detect', value: 'auto' },
          { name: 'Custom command', value: 'custom' },
        ],
      });

      let shellPath = '/bin/sh';

      if (shellChoice === 'auto') {
        spinner.start('Detecting available shell...');
        try {
          shellPath = await detectShell(containerName);
          spinner.succeed(`Detected: ${shellPath}`);
        } catch {
          spinner.warn('Using fallback: /bin/sh');
        }
      } else if (shellChoice === 'bash') {
        shellPath = '/bin/bash';
      } else if (shellChoice === 'custom') {
        shellPath = await input({
          message: 'Enter command to execute:',
          default: '/bin/sh',
        });
      }

      console.log(chalk.cyan(`\nOpening shell in ${containerName}...`));
      console.log(chalk.gray('Type "exit" to return to DockerDash\n'));

      try {
        await openInteractiveShell(containerName, { shell: shellPath });
        console.log(chalk.cyan('\nShell session ended'));
      } catch (error) {
        showStatus(`Shell error: ${error.message}`, 'error');
      }
      await pressEnterToContinue();
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
    new Separator(),
    { name: '🗑️  Remove', value: 'remove' },
    new Separator(),
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
 * Display volumes menu
 */
async function volumesMenu() {
  clearScreen();
  showHeader('Volumes');

  const spinner = ora('Loading volumes...').start();
  const volumes = await getVolumes();
  spinner.stop();

  if (volumes.length === 0) {
    showStatus('No volumes found', 'warning');

    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: chalk.cyan('+ Create new volume'), value: 'create' },
        { name: chalk.gray('← Back to main menu'), value: 'back' },
      ],
    });

    if (action === 'create') {
      await createVolumeMenu();
      return;
    }
    return mainMenu();
  }

  console.log(renderVolumesTable(volumes));
  console.log(
    chalk.gray('\n[Enter] Inspect  [D] Delete  [C] Create  [Q] Back\n')
  );

  const choices = volumes.map((vol) => ({
    name: `${vol.name} ${chalk.gray(`(${vol.driver})`)}`,
    value: { name: vol.name, driver: vol.driver },
  }));

  choices.push({ name: chalk.cyan('+ Create new volume'), value: 'create' });
  choices.push({ name: chalk.yellow('🧹 Prune unused volumes'), value: 'prune' });
  choices.push({ name: chalk.gray('← Back to main menu'), value: 'back' });

  const selected = await select({
    message: 'Select a volume:',
    choices,
  });

  if (selected === 'back') {
    return mainMenu();
  }

  if (selected === 'create') {
    await createVolumeMenu();
    return;
  }

  if (selected === 'prune') {
    await pruneVolumesMenu();
    return;
  }

  await volumeActionsMenu(selected);
}

/**
 * Display volume actions menu
 * @param {Object} volumeInfo - Volume info { name, driver }
 */
async function volumeActionsMenu(volumeInfo) {
  clearScreen();
  showHeader(`Volume: ${volumeInfo.name}`);

  const spinner = ora('Loading volume details...').start();
  let volumeDetails;
  let containers = [];

  try {
    volumeDetails = await inspectVolume(volumeInfo.name);
    containers = await getVolumeContainers(volumeInfo.name);
    spinner.stop();

    console.log(chalk.gray(`  Driver: ${volumeDetails.Driver}`));
    console.log(chalk.gray(`  Scope: ${volumeDetails.Scope}`));
    console.log(chalk.gray(`  Mountpoint: ${volumeDetails.Mountpoint}`));

    if (containers.length > 0) {
      console.log(chalk.bold('\n  Used by containers:'));
      for (const c of containers) {
        const stateColor = c.state === 'running' ? chalk.green : chalk.red;
        console.log(`    ${stateColor('●')} ${c.name}`);
      }
    }
    console.log('');
  } catch {
    spinner.stop();
  }

  const choices = [
    { name: '🔍 Inspect (full details)', value: 'inspect' },
    new Separator(),
    { name: '🗑️  Remove', value: 'remove' },
    new Separator(),
    { name: '← Back', value: 'back' },
  ];

  const action = await select({
    message: `Actions for ${volumeInfo.name}:`,
    choices,
  });

  const spinnerAction = ora();

  switch (action) {
    case 'inspect':
      clearScreen();
      showHeader(`Inspect: ${volumeInfo.name}`);

      try {
        const details = await inspectVolume(volumeInfo.name);
        console.log(chalk.bold('\nVolume Details:\n'));
        console.log(chalk.gray('Name:'), details.Name);
        console.log(chalk.gray('Driver:'), details.Driver);
        console.log(chalk.gray('Scope:'), details.Scope);
        console.log(chalk.gray('Mountpoint:'), details.Mountpoint);
        console.log(chalk.gray('Created:'), details.CreatedAt || 'N/A');

        if (Object.keys(details.Labels || {}).length > 0) {
          console.log(chalk.bold('\nLabels:'));
          for (const [key, value] of Object.entries(details.Labels)) {
            console.log(chalk.gray(`  ${key}: ${value}`));
          }
        }

        if (Object.keys(details.Options || {}).length > 0) {
          console.log(chalk.bold('\nOptions:'));
          for (const [key, value] of Object.entries(details.Options)) {
            console.log(chalk.gray(`  ${key}: ${value}`));
          }
        }
      } catch (error) {
        console.log(chalk.red(`Error: ${error.message}`));
      }

      await pressEnterToContinue();
      break;

    case 'remove':
      if (containers.length > 0) {
        showStatus(`Volume is in use by ${containers.length} container(s)`, 'warning');
      }

      const confirmRemove = await confirm({
        message: `Are you sure you want to remove ${volumeInfo.name}?`,
        default: false,
      });

      if (confirmRemove) {
        spinnerAction.start(`Removing ${volumeInfo.name}...`);
        try {
          await removeVolume(volumeInfo.name);
          spinnerAction.succeed(`Volume ${volumeInfo.name} removed`);
          await pressEnterToContinue();
          return volumesMenu();
        } catch (error) {
          spinnerAction.fail(`Failed to remove: ${error.message}`);
        }
      }
      await pressEnterToContinue();
      break;

    case 'back':
      return volumesMenu();
  }

  await volumeActionsMenu(volumeInfo);
}

/**
 * Create volume menu
 */
async function createVolumeMenu() {
  clearScreen();
  showHeader('Create Volume');

  const name = await input({
    message: 'Volume name:',
    validate: (value) => {
      if (!value.trim()) return 'Name cannot be empty';
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) {
        return 'Invalid volume name format';
      }
      return true;
    },
  });

  const driver = await select({
    message: 'Driver:',
    choices: [
      { name: 'local (default)', value: 'local' },
      { name: 'Custom', value: 'custom' },
    ],
  });

  let driverName = 'local';
  if (driver === 'custom') {
    driverName = await input({
      message: 'Driver name:',
      default: 'local',
    });
  }

  const confirmCreate = await confirm({
    message: `Create volume "${name}" with driver "${driverName}"?`,
    default: true,
  });

  if (!confirmCreate) {
    return volumesMenu();
  }

  const spinner = ora(`Creating volume ${name}...`).start();
  try {
    await createVolume({ name, driver: driverName });
    spinner.succeed(`Volume ${name} created`);
  } catch (error) {
    spinner.fail(`Failed to create: ${error.message}`);
  }

  await pressEnterToContinue();
  return volumesMenu();
}

/**
 * Prune unused volumes
 */
async function pruneVolumesMenu() {
  const confirmPrune = await confirm({
    message: 'Remove all unused volumes? (This cannot be undone!)',
    default: false,
  });

  if (!confirmPrune) {
    return volumesMenu();
  }

  const spinner = ora('Pruning unused volumes...').start();
  try {
    const result = await pruneVolumes();
    const spaceReclaimed = result.SpaceReclaimed || 0;
    const count = result.VolumesDeleted?.length || 0;

    spinner.succeed(`Pruned ${count} volumes, reclaimed ${(spaceReclaimed / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    spinner.fail(`Prune failed: ${error.message}`);
  }

  await pressEnterToContinue();
  return volumesMenu();
}

/**
 * Display networks menu
 */
async function networksMenu() {
  clearScreen();
  showHeader('Networks');

  const spinner = ora('Loading networks...').start();
  const networks = await getNetworks();
  spinner.stop();

  if (networks.length === 0) {
    showStatus('No networks found', 'warning');

    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: chalk.cyan('+ Create new network'), value: 'create' },
        { name: chalk.gray('← Back to main menu'), value: 'back' },
      ],
    });

    if (action === 'create') {
      await createNetworkMenu();
      return;
    }
    return mainMenu();
  }

  console.log(renderNetworksTable(networks));
  console.log(
    chalk.gray('\n[Enter] Inspect  [D] Delete  [C] Create  [Q] Back\n')
  );

  const choices = networks.map((net) => {
    const isSystem = isSystemNetwork(net.name);
    const label = isSystem ? chalk.yellow('(system)') : chalk.gray(`(${net.containers} containers)`);
    return {
      name: `${net.name} ${label}`,
      value: { id: net.id, name: net.name, isSystem },
    };
  });

  choices.push({ name: chalk.cyan('+ Create new network'), value: 'create' });
  choices.push({ name: chalk.yellow('🧹 Prune unused networks'), value: 'prune' });
  choices.push({ name: chalk.gray('← Back to main menu'), value: 'back' });

  const selected = await select({
    message: 'Select a network:',
    choices,
  });

  if (selected === 'back') {
    return mainMenu();
  }

  if (selected === 'create') {
    await createNetworkMenu();
    return;
  }

  if (selected === 'prune') {
    await pruneNetworksMenu();
    return;
  }

  await networkActionsMenu(selected);
}

/**
 * Display network actions menu
 * @param {Object} networkInfo - Network info { id, name, isSystem }
 */
async function networkActionsMenu(networkInfo) {
  clearScreen();
  showHeader(`Network: ${networkInfo.name}`);

  const spinner = ora('Loading network details...').start();
  let networkDetails;
  let containers = [];

  try {
    networkDetails = await inspectNetwork(networkInfo.id);
    containers = await getNetworkContainers(networkInfo.id);
    spinner.stop();

    console.log(chalk.gray(`  Driver: ${networkDetails.Driver}`));
    console.log(chalk.gray(`  Scope: ${networkDetails.Scope}`));
    console.log(chalk.gray(`  Internal: ${networkDetails.Internal ? 'Yes' : 'No'}`));

    if (networkDetails.IPAM?.Config?.length > 0) {
      const ipam = networkDetails.IPAM.Config[0];
      if (ipam.Subnet) console.log(chalk.gray(`  Subnet: ${ipam.Subnet}`));
      if (ipam.Gateway) console.log(chalk.gray(`  Gateway: ${ipam.Gateway}`));
    }

    if (containers.length > 0) {
      console.log(chalk.bold('\n  Connected containers:'));
      for (const c of containers) {
        console.log(`    ${chalk.cyan('●')} ${c.name} ${chalk.gray(`(${c.ipv4 || 'no IP'})`)}`);
      }
    }
    console.log('');
  } catch {
    spinner.stop();
  }

  const choices = [
    { name: '🔍 Inspect (full details)', value: 'inspect' },
  ];

  if (!networkInfo.isSystem) {
    choices.push(new Separator());
    choices.push({ name: '🗑️  Remove', value: 'remove' });
  } else {
    choices.push(new Separator());
    choices.push({ name: chalk.gray('🗑️  Remove (system network - disabled)'), value: 'remove-disabled', disabled: true });
  }

  choices.push(new Separator());
  choices.push({ name: '← Back', value: 'back' });

  const action = await select({
    message: `Actions for ${networkInfo.name}:`,
    choices,
  });

  const spinnerAction = ora();

  switch (action) {
    case 'inspect':
      clearScreen();
      showHeader(`Inspect: ${networkInfo.name}`);

      try {
        const details = await inspectNetwork(networkInfo.id);
        console.log(chalk.bold('\nNetwork Details:\n'));
        console.log(chalk.gray('Name:'), details.Name);
        console.log(chalk.gray('ID:'), details.Id.substring(0, 12));
        console.log(chalk.gray('Driver:'), details.Driver);
        console.log(chalk.gray('Scope:'), details.Scope);
        console.log(chalk.gray('Internal:'), details.Internal ? 'Yes' : 'No');
        console.log(chalk.gray('Attachable:'), details.Attachable ? 'Yes' : 'No');
        console.log(chalk.gray('Created:'), details.Created || 'N/A');

        if (details.IPAM?.Config?.length > 0) {
          console.log(chalk.bold('\nIPAM Config:'));
          for (const config of details.IPAM.Config) {
            if (config.Subnet) console.log(chalk.gray(`  Subnet: ${config.Subnet}`));
            if (config.Gateway) console.log(chalk.gray(`  Gateway: ${config.Gateway}`));
            if (config.IPRange) console.log(chalk.gray(`  IP Range: ${config.IPRange}`));
          }
        }

        if (Object.keys(details.Labels || {}).length > 0) {
          console.log(chalk.bold('\nLabels:'));
          for (const [key, value] of Object.entries(details.Labels)) {
            console.log(chalk.gray(`  ${key}: ${value}`));
          }
        }

        if (containers.length > 0) {
          console.log(chalk.bold('\nContainers:'));
          for (const c of containers) {
            console.log(chalk.cyan(`  ${c.name}`));
            console.log(chalk.gray(`    IPv4: ${c.ipv4 || 'N/A'}`));
            console.log(chalk.gray(`    MAC: ${c.mac || 'N/A'}`));
          }
        }
      } catch (error) {
        console.log(chalk.red(`Error: ${error.message}`));
      }

      await pressEnterToContinue();
      break;

    case 'remove':
      if (containers.length > 0) {
        showStatus(`Network has ${containers.length} connected container(s)`, 'warning');
      }

      const confirmRemove = await confirm({
        message: `Are you sure you want to remove ${networkInfo.name}?`,
        default: false,
      });

      if (confirmRemove) {
        spinnerAction.start(`Removing ${networkInfo.name}...`);
        try {
          await removeNetwork(networkInfo.id);
          spinnerAction.succeed(`Network ${networkInfo.name} removed`);
          await pressEnterToContinue();
          return networksMenu();
        } catch (error) {
          spinnerAction.fail(`Failed to remove: ${error.message}`);
        }
      }
      await pressEnterToContinue();
      break;

    case 'back':
      return networksMenu();
  }

  await networkActionsMenu(networkInfo);
}

/**
 * Create network menu
 */
async function createNetworkMenu() {
  clearScreen();
  showHeader('Create Network');

  const name = await input({
    message: 'Network name:',
    validate: (value) => {
      if (!value.trim()) return 'Name cannot be empty';
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value)) {
        return 'Invalid network name format';
      }
      return true;
    },
  });

  const driver = await select({
    message: 'Driver:',
    choices: [
      { name: 'bridge (default)', value: 'bridge' },
      { name: 'host', value: 'host' },
      { name: 'overlay', value: 'overlay' },
      { name: 'macvlan', value: 'macvlan' },
      { name: 'none', value: 'none' },
    ],
  });

  const internal = await confirm({
    message: 'Internal network? (no external access)',
    default: false,
  });

  const configureSubnet = await confirm({
    message: 'Configure custom subnet?',
    default: false,
  });

  let subnet = null;
  let gateway = null;

  if (configureSubnet) {
    subnet = await input({
      message: 'Subnet (e.g., 172.20.0.0/16):',
      validate: (value) => {
        if (!value.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/)) {
          return 'Invalid subnet format (use CIDR notation)';
        }
        return true;
      },
    });

    gateway = await input({
      message: 'Gateway (e.g., 172.20.0.1):',
      validate: (value) => {
        if (!value.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
          return 'Invalid IP address format';
        }
        return true;
      },
    });
  }

  const confirmCreate = await confirm({
    message: `Create network "${name}" with driver "${driver}"?`,
    default: true,
  });

  if (!confirmCreate) {
    return networksMenu();
  }

  const spinner = ora(`Creating network ${name}...`).start();
  try {
    await createNetwork({ name, driver, internal, subnet, gateway });
    spinner.succeed(`Network ${name} created`);
  } catch (error) {
    spinner.fail(`Failed to create: ${error.message}`);
  }

  await pressEnterToContinue();
  return networksMenu();
}

/**
 * Prune unused networks
 */
async function pruneNetworksMenu() {
  const confirmPrune = await confirm({
    message: 'Remove all unused networks?',
    default: false,
  });

  if (!confirmPrune) {
    return networksMenu();
  }

  const spinner = ora('Pruning unused networks...').start();
  try {
    const result = await pruneNetworks();
    const count = result.NetworksDeleted?.length || 0;

    spinner.succeed(`Pruned ${count} networks`);
  } catch (error) {
    spinner.fail(`Prune failed: ${error.message}`);
  }

  await pressEnterToContinue();
  return networksMenu();
}

/**
 * System Prune Wizard - Interactive cleanup tool
 */
async function systemPruneWizard() {
  clearScreen();
  showHeader('System Prune Wizard');

  console.log(chalk.gray('  Analyzing Docker disk usage...\n'));

  const spinner = ora('Calculating disk usage...').start();

  let diskUsage;
  try {
    diskUsage = await getDiskUsage();
    spinner.stop();
  } catch (error) {
    spinner.fail('Failed to get disk usage');
    console.log(chalk.red(`  Error: ${error.message}`));
    await pressEnterToContinue();
    return mainMenu();
  }

  // Calculate usage stats
  const containers = diskUsage.Containers || [];
  const images = diskUsage.Images || [];
  const volumes = diskUsage.Volumes || [];
  const buildCache = diskUsage.BuildCache || [];

  const stoppedContainers = containers.filter((c) => c.State !== 'running');
  const danglingImages = images.filter((i) => i.Containers === 0);
  const unusedVolumes = volumes.filter((v) => v.UsageData?.RefCount === 0);

  const stoppedContainersSize = stoppedContainers.reduce((acc, c) => acc + (c.SizeRw || 0), 0);
  const danglingImagesSize = danglingImages.reduce((acc, i) => acc + (i.Size || 0), 0);
  const unusedVolumesSize = unusedVolumes.reduce((acc, v) => acc + (v.UsageData?.Size || 0), 0);
  const buildCacheSize = buildCache.reduce((acc, b) => acc + (b.Size || 0), 0);

  const totalReclaimable = stoppedContainersSize + danglingImagesSize + unusedVolumesSize + buildCacheSize;

  // Display current usage
  console.log(chalk.bold('  Docker Disk Usage Summary\n'));

  const maxBarWidth = 30;
  const totalImagesSize = images.reduce((acc, i) => acc + (i.Size || 0), 0);
  const totalVolumesSize = volumes.reduce((acc, v) => acc + (v.UsageData?.Size || 0), 0);
  const totalContainersSize = containers.reduce((acc, c) => acc + (c.SizeRw || 0) + (c.SizeRootFs || 0), 0);

  const maxSize = Math.max(totalImagesSize, totalVolumesSize, totalContainersSize, buildCacheSize, 1);

  console.log(chalk.cyan('  Images:'));
  console.log(`    Total: ${images.length} (${formatBytes(totalImagesSize)})`);
  console.log(`    ${progressBar((totalImagesSize / maxSize) * 100, maxBarWidth, { showPercent: false })}`);
  console.log(chalk.yellow(`    Reclaimable: ${danglingImages.length} images (${formatBytes(danglingImagesSize)})`));
  console.log('');

  console.log(chalk.cyan('  Containers:'));
  console.log(`    Total: ${containers.length} (${formatBytes(totalContainersSize)})`);
  console.log(`    ${progressBar((totalContainersSize / maxSize) * 100, maxBarWidth, { showPercent: false })}`);
  console.log(chalk.yellow(`    Reclaimable: ${stoppedContainers.length} stopped (${formatBytes(stoppedContainersSize)})`));
  console.log('');

  console.log(chalk.cyan('  Volumes:'));
  console.log(`    Total: ${volumes.length} (${formatBytes(totalVolumesSize)})`);
  console.log(`    ${progressBar((totalVolumesSize / maxSize) * 100, maxBarWidth, { showPercent: false })}`);
  console.log(chalk.yellow(`    Reclaimable: ${unusedVolumes.length} unused (${formatBytes(unusedVolumesSize)})`));
  console.log('');

  console.log(chalk.cyan('  Build Cache:'));
  console.log(`    Total: ${buildCache.length} entries (${formatBytes(buildCacheSize)})`);
  console.log(`    ${progressBar((buildCacheSize / maxSize) * 100, maxBarWidth, { showPercent: false })}`);
  console.log(chalk.yellow(`    Reclaimable: ${formatBytes(buildCacheSize)}`));
  console.log('');

  console.log(chalk.bold.green(`  Total Reclaimable: ${formatBytes(totalReclaimable)}`));
  console.log('');

  // Prune options
  const action = await select({
    message: 'What would you like to clean?',
    choices: [
      {
        name: `🧹 Quick Clean ${chalk.gray(`(containers + dangling images) - ${formatBytes(stoppedContainersSize + danglingImagesSize)}`)}`,
        value: 'quick',
      },
      {
        name: `🔥 Full Clean ${chalk.gray(`(all unused resources) - ${formatBytes(totalReclaimable)}`)}`,
        value: 'full',
      },
      new Separator(),
      {
        name: `📦 Stopped Containers only ${chalk.gray(`(${stoppedContainers.length}) - ${formatBytes(stoppedContainersSize)}`)}`,
        value: 'containers',
      },
      {
        name: `🖼️  Dangling Images only ${chalk.gray(`(${danglingImages.length}) - ${formatBytes(danglingImagesSize)}`)}`,
        value: 'images',
      },
      {
        name: `💾 Unused Volumes only ${chalk.gray(`(${unusedVolumes.length}) - ${formatBytes(unusedVolumesSize)}`)}`,
        value: 'volumes',
      },
      {
        name: `🔨 Build Cache only ${chalk.gray(`- ${formatBytes(buildCacheSize)}`)}`,
        value: 'buildcache',
      },
      {
        name: `🌐 Unused Networks only`,
        value: 'networks',
      },
      new Separator(),
      { name: '← Back to main menu', value: 'back' },
    ],
  });

  if (action === 'back') {
    return mainMenu();
  }

  // Confirm action
  let confirmMessage = '';
  switch (action) {
    case 'quick':
      confirmMessage = 'Remove stopped containers and dangling images?';
      break;
    case 'full':
      confirmMessage = 'Remove ALL unused resources? (containers, images, volumes, networks, build cache)';
      break;
    case 'containers':
      confirmMessage = `Remove ${stoppedContainers.length} stopped containers?`;
      break;
    case 'images':
      confirmMessage = `Remove ${danglingImages.length} dangling images?`;
      break;
    case 'volumes':
      confirmMessage = `Remove ${unusedVolumes.length} unused volumes? (This cannot be undone!)`;
      break;
    case 'buildcache':
      confirmMessage = 'Clear build cache?';
      break;
    case 'networks':
      confirmMessage = 'Remove unused networks?';
      break;
  }

  const confirmed = await confirm({
    message: confirmMessage,
    default: false,
  });

  if (!confirmed) {
    await systemPruneWizard();
    return;
  }

  // Execute prune operations
  clearScreen();
  showHeader('Cleaning...');
  console.log('');

  const results = {
    containers: { count: 0, space: 0 },
    images: { count: 0, space: 0 },
    volumes: { count: 0, space: 0 },
    networks: { count: 0 },
    buildCache: { count: 0, space: 0 },
  };

  const pruneSpinner = ora();

  try {
    // Containers
    if (['quick', 'full', 'containers'].includes(action)) {
      pruneSpinner.start('Removing stopped containers...');
      const result = await dockerPruneContainers();
      results.containers.count = result.ContainersDeleted?.length || 0;
      results.containers.space = result.SpaceReclaimed || 0;
      pruneSpinner.succeed(`Removed ${results.containers.count} containers (${formatBytes(results.containers.space)})`);
    }

    // Images
    if (['quick', 'full', 'images'].includes(action)) {
      pruneSpinner.start('Removing dangling images...');
      const result = await dockerPruneImages();
      results.images.count = result.ImagesDeleted?.length || 0;
      results.images.space = result.SpaceReclaimed || 0;
      pruneSpinner.succeed(`Removed ${results.images.count} images (${formatBytes(results.images.space)})`);
    }

    // Volumes
    if (['full', 'volumes'].includes(action)) {
      pruneSpinner.start('Removing unused volumes...');
      const result = await dockerPruneVolumes();
      results.volumes.count = result.VolumesDeleted?.length || 0;
      results.volumes.space = result.SpaceReclaimed || 0;
      pruneSpinner.succeed(`Removed ${results.volumes.count} volumes (${formatBytes(results.volumes.space)})`);
    }

    // Networks
    if (['full', 'networks'].includes(action)) {
      pruneSpinner.start('Removing unused networks...');
      const result = await dockerPruneNetworks();
      results.networks.count = result.NetworksDeleted?.length || 0;
      pruneSpinner.succeed(`Removed ${results.networks.count} networks`);
    }

    // Build Cache
    if (['full', 'buildcache'].includes(action)) {
      pruneSpinner.start('Clearing build cache...');
      try {
        const result = await pruneBuildCache();
        results.buildCache.count = result.CachesDeleted?.length || 0;
        results.buildCache.space = result.SpaceReclaimed || 0;
        pruneSpinner.succeed(`Cleared build cache (${formatBytes(results.buildCache.space)})`);
      } catch {
        pruneSpinner.warn('Build cache prune not available');
      }
    }

    // Summary
    console.log('');
    const totalReclaimed =
      results.containers.space +
      results.images.space +
      results.volumes.space +
      results.buildCache.space;

    console.log(chalk.bold.green(`  Total space reclaimed: ${formatBytes(totalReclaimed)}`));

  } catch (error) {
    pruneSpinner.fail(`Prune failed: ${error.message}`);
  }

  await pressEnterToContinue();
  return mainMenu();
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
      new Separator(),
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
