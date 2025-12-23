import Docker from 'dockerode';
import { existsSync } from 'fs';
import { homedir } from 'os';

/**
 * Get the Docker socket path
 * Checks multiple locations for compatibility with Docker Desktop and standard Docker
 */
function getDockerSocketPath() {
  const possiblePaths = [
    process.env.DOCKER_HOST?.replace('unix://', ''),
    `${homedir()}/.docker/desktop/docker.sock`, // Docker Desktop (Linux)
    '/var/run/docker.sock', // Standard Docker
    `${homedir()}/.docker/run/docker.sock`, // Docker Desktop alternative
  ].filter(Boolean);

  for (const socketPath of possiblePaths) {
    if (existsSync(socketPath)) {
      return socketPath;
    }
  }

  return '/var/run/docker.sock'; // Fallback
}

const docker = new Docker({ socketPath: getDockerSocketPath() });

/**
 * Check if Docker daemon is running
 * @returns {Promise<boolean>}
 */
export async function isDockerRunning() {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Docker version info
 * @returns {Promise<Object>}
 */
export async function getDockerInfo() {
  return docker.version();
}

/**
 * Get a container by ID or name
 * @param {string} idOrName - Container ID or name
 * @returns {Docker.Container}
 */
export function getContainer(idOrName) {
  return docker.getContainer(idOrName);
}

/**
 * Get an image by name
 * @param {string} name - Image name
 * @returns {Docker.Image}
 */
export function getImage(name) {
  return docker.getImage(name);
}

/**
 * List all containers
 * @param {boolean} all - Include stopped containers
 * @returns {Promise<Array>}
 */
export async function listContainers(all = true) {
  return docker.listContainers({ all });
}

/**
 * List all images
 * @returns {Promise<Array>}
 */
export async function listImages() {
  return docker.listImages();
}

/**
 * List all volumes
 * @returns {Promise<Object>}
 */
export async function listVolumes() {
  return docker.listVolumes();
}

/**
 * List all networks
 * @returns {Promise<Array>}
 */
export async function listNetworks() {
  return docker.listNetworks();
}

/**
 * Prune unused containers, images, volumes, and networks
 * @returns {Promise<Object>}
 */
export async function systemPrune() {
  const [containers, images, volumes, networks] = await Promise.all([
    docker.pruneContainers(),
    docker.pruneImages(),
    docker.pruneVolumes(),
    docker.pruneNetworks(),
  ]);

  return { containers, images, volumes, networks };
}

/**
 * Prune stopped containers
 * @returns {Promise<Object>}
 */
export async function pruneContainers() {
  return docker.pruneContainers();
}

/**
 * Prune unused images
 * @param {boolean} all - Remove all unused images, not just dangling
 * @returns {Promise<Object>}
 */
export async function pruneImages(all = false) {
  return docker.pruneImages({ filters: all ? {} : { dangling: { true: true } } });
}

/**
 * Prune unused volumes
 * @returns {Promise<Object>}
 */
export async function pruneVolumes() {
  return docker.pruneVolumes();
}

/**
 * Prune unused networks
 * @returns {Promise<Object>}
 */
export async function pruneNetworks() {
  return docker.pruneNetworks();
}

/**
 * Prune build cache
 * @returns {Promise<Object>}
 */
export async function pruneBuildCache() {
  // Build cache prune via API
  return docker.pruneBuilder();
}

/**
 * Get Docker disk usage info
 * @returns {Promise<Object>}
 */
export async function getDiskUsage() {
  return docker.df();
}

/**
 * Get system info
 * @returns {Promise<Object>}
 */
export async function getSystemInfo() {
  return docker.info();
}

export default docker;
