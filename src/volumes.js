import docker, { listVolumes } from './docker.js';
import { formatBytes } from './utils/format.js';

/**
 * Get all volumes with formatted info
 * @returns {Promise<Array>}
 */
export async function getVolumes() {
  const result = await listVolumes();
  const volumes = result.Volumes || [];

  return volumes.map((volume) => ({
    name: volume.Name,
    driver: volume.Driver,
    mountpoint: volume.Mountpoint,
    scope: volume.Scope,
    createdAt: volume.CreatedAt,
    labels: volume.Labels || {},
  }));
}

/**
 * Get volume by name
 * @param {string} name - Volume name
 * @returns {Docker.Volume}
 */
export function getVolume(name) {
  return docker.getVolume(name);
}

/**
 * Inspect volume for detailed info
 * @param {string} name - Volume name
 * @returns {Promise<Object>}
 */
export async function inspectVolume(name) {
  const volume = getVolume(name);
  return volume.inspect();
}

/**
 * Create a new volume
 * @param {Object} options - Volume options
 * @returns {Promise<Object>}
 */
export async function createVolume(options = {}) {
  const { name, driver = 'local', labels = {} } = options;

  return docker.createVolume({
    Name: name,
    Driver: driver,
    Labels: labels,
  });
}

/**
 * Remove a volume
 * @param {string} name - Volume name
 * @param {boolean} force - Force removal
 * @returns {Promise<void>}
 */
export async function removeVolume(name, force = false) {
  const volume = getVolume(name);
  await volume.remove({ force });
}

/**
 * Prune unused volumes
 * @returns {Promise<Object>}
 */
export async function pruneVolumes() {
  return docker.pruneVolumes();
}

/**
 * Get containers using a volume
 * @param {string} volumeName - Volume name
 * @returns {Promise<Array>}
 */
export async function getVolumeContainers(volumeName) {
  const containers = await docker.listContainers({ all: true });

  return containers.filter((container) => {
    const mounts = container.Mounts || [];
    return mounts.some((mount) => mount.Name === volumeName);
  }).map((container) => ({
    id: container.Id.substring(0, 12),
    name: container.Names[0].replace(/^\//, ''),
    state: container.State,
  }));
}

export default {
  getVolumes,
  getVolume,
  inspectVolume,
  createVolume,
  removeVolume,
  pruneVolumes,
  getVolumeContainers,
};
