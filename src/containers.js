import { getContainer, listContainers } from './docker.js';
import { formatBytes, formatUptime, formatPorts } from './utils/format.js';

/**
 * Get all containers with formatted info
 * @param {boolean} all - Include stopped containers
 * @returns {Promise<Array>}
 */
export async function getContainers(all = true) {
  const containers = await listContainers(all);

  return containers.map((container) => ({
    id: container.Id.substring(0, 12),
    name: container.Names[0].replace(/^\//, ''),
    image: container.Image,
    status: container.Status,
    state: container.State,
    ports: formatPorts(container.Ports),
    created: container.Created,
  }));
}

/**
 * Get container count by state
 * @returns {Promise<{running: number, stopped: number, total: number}>}
 */
export async function getContainerCounts() {
  const containers = await listContainers(true);
  const running = containers.filter((c) => c.State === 'running').length;
  const stopped = containers.filter((c) => c.State !== 'running').length;

  return {
    running,
    stopped,
    total: containers.length,
  };
}

/**
 * Start a container
 * @param {string} idOrName - Container ID or name
 * @returns {Promise<void>}
 */
export async function startContainer(idOrName) {
  const container = getContainer(idOrName);
  await container.start();
}

/**
 * Stop a container
 * @param {string} idOrName - Container ID or name
 * @returns {Promise<void>}
 */
export async function stopContainer(idOrName) {
  const container = getContainer(idOrName);
  await container.stop();
}

/**
 * Restart a container
 * @param {string} idOrName - Container ID or name
 * @returns {Promise<void>}
 */
export async function restartContainer(idOrName) {
  const container = getContainer(idOrName);
  await container.restart();
}

/**
 * Remove a container
 * @param {string} idOrName - Container ID or name
 * @param {boolean} force - Force remove running container
 * @returns {Promise<void>}
 */
export async function removeContainer(idOrName, force = false) {
  const container = getContainer(idOrName);
  await container.remove({ force });
}

/**
 * Get container inspect data
 * @param {string} idOrName - Container ID or name
 * @returns {Promise<Object>}
 */
export async function inspectContainer(idOrName) {
  const container = getContainer(idOrName);
  return container.inspect();
}

/**
 * Execute a command in a container
 * @param {string} idOrName - Container ID or name
 * @param {string[]} cmd - Command to execute
 * @returns {Promise<Object>}
 */
export async function execInContainer(idOrName, cmd = ['/bin/sh']) {
  const container = getContainer(idOrName);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
  });

  return exec;
}
