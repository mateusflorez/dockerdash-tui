import Table from 'cli-table3';
import chalk from 'chalk';
import { truncate, getStateEmoji } from '../utils/format.js';

/**
 * Create a styled table
 * @param {Object} options - Table options
 * @returns {Table}
 */
export function createTable(options = {}) {
  return new Table({
    chars: {
      top: '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│',
    },
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
    ...options,
  });
}

/**
 * Render containers table
 * @param {Array} containers - List of containers
 * @returns {string}
 */
export function renderContainersTable(containers) {
  const table = createTable({
    head: ['', 'NAME', 'IMAGE', 'STATUS', 'PORTS'],
    colWidths: [3, 20, 20, 15, 25],
  });

  for (const container of containers) {
    const stateColor = container.state === 'running' ? chalk.green : chalk.red;
    const stateEmoji = getStateEmoji(container.state);

    table.push([
      stateColor(stateEmoji),
      chalk.white(truncate(container.name, 18)),
      chalk.gray(truncate(container.image, 18)),
      stateColor(truncate(container.status, 13)),
      chalk.gray(truncate(container.ports, 23)),
    ]);
  }

  return table.toString();
}

/**
 * Render images table
 * @param {Array} images - List of images
 * @returns {string}
 */
export function renderImagesTable(images) {
  const table = createTable({
    head: ['REPOSITORY', 'TAG', 'SIZE', 'CREATED'],
    colWidths: [30, 15, 12, 15],
  });

  for (const image of images) {
    table.push([
      chalk.white(truncate(image.repository, 28)),
      chalk.gray(truncate(image.tag, 13)),
      chalk.cyan(image.size),
      chalk.gray(image.created),
    ]);
  }

  return table.toString();
}

/**
 * Render volumes table
 * @param {Array} volumes - List of volumes
 * @returns {string}
 */
export function renderVolumesTable(volumes) {
  const table = createTable({
    head: ['NAME', 'DRIVER', 'MOUNTPOINT'],
    colWidths: [30, 12, 40],
  });

  for (const volume of volumes) {
    table.push([
      chalk.white(truncate(volume.name, 28)),
      chalk.gray(volume.driver),
      chalk.gray(truncate(volume.mountpoint, 38)),
    ]);
  }

  return table.toString();
}

/**
 * Render networks table
 * @param {Array} networks - List of networks
 * @returns {string}
 */
export function renderNetworksTable(networks) {
  const table = createTable({
    head: ['NAME', 'DRIVER', 'SCOPE', 'ID'],
    colWidths: [25, 12, 10, 15],
  });

  for (const network of networks) {
    table.push([
      chalk.white(truncate(network.name, 23)),
      chalk.gray(network.driver),
      chalk.gray(network.scope),
      chalk.gray(network.id.substring(0, 12)),
    ]);
  }

  return table.toString();
}

export default {
  createTable,
  renderContainersTable,
  renderImagesTable,
  renderVolumesTable,
  renderNetworksTable,
};
