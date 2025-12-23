import docker, { listNetworks } from './docker.js';

/**
 * Get all networks with formatted info
 * @returns {Promise<Array>}
 */
export async function getNetworks() {
  const networks = await listNetworks();

  return networks.map((network) => ({
    id: network.Id,
    name: network.Name,
    driver: network.Driver,
    scope: network.Scope,
    internal: network.Internal,
    ipam: network.IPAM,
    containers: Object.keys(network.Containers || {}).length,
    labels: network.Labels || {},
  }));
}

/**
 * Get network by ID or name
 * @param {string} idOrName - Network ID or name
 * @returns {Docker.Network}
 */
export function getNetwork(idOrName) {
  return docker.getNetwork(idOrName);
}

/**
 * Inspect network for detailed info
 * @param {string} idOrName - Network ID or name
 * @returns {Promise<Object>}
 */
export async function inspectNetwork(idOrName) {
  const network = getNetwork(idOrName);
  return network.inspect();
}

/**
 * Create a new network
 * @param {Object} options - Network options
 * @returns {Promise<Object>}
 */
export async function createNetwork(options = {}) {
  const {
    name,
    driver = 'bridge',
    internal = false,
    attachable = true,
    labels = {},
    subnet = null,
    gateway = null,
  } = options;

  const config = {
    Name: name,
    Driver: driver,
    Internal: internal,
    Attachable: attachable,
    Labels: labels,
  };

  if (subnet || gateway) {
    config.IPAM = {
      Config: [{
        Subnet: subnet,
        Gateway: gateway,
      }],
    };
  }

  return docker.createNetwork(config);
}

/**
 * Remove a network
 * @param {string} idOrName - Network ID or name
 * @returns {Promise<void>}
 */
export async function removeNetwork(idOrName) {
  const network = getNetwork(idOrName);
  await network.remove();
}

/**
 * Prune unused networks
 * @returns {Promise<Object>}
 */
export async function pruneNetworks() {
  return docker.pruneNetworks();
}

/**
 * Connect a container to a network
 * @param {string} networkId - Network ID or name
 * @param {string} containerId - Container ID or name
 * @param {Object} options - Connection options
 * @returns {Promise<void>}
 */
export async function connectContainer(networkId, containerId, options = {}) {
  const network = getNetwork(networkId);
  await network.connect({
    Container: containerId,
    ...options,
  });
}

/**
 * Disconnect a container from a network
 * @param {string} networkId - Network ID or name
 * @param {string} containerId - Container ID or name
 * @param {boolean} force - Force disconnect
 * @returns {Promise<void>}
 */
export async function disconnectContainer(networkId, containerId, force = false) {
  const network = getNetwork(networkId);
  await network.disconnect({
    Container: containerId,
    Force: force,
  });
}

/**
 * Get containers connected to a network
 * @param {string} networkId - Network ID or name
 * @returns {Promise<Array>}
 */
export async function getNetworkContainers(networkId) {
  const network = await inspectNetwork(networkId);
  const containers = network.Containers || {};

  return Object.entries(containers).map(([id, info]) => ({
    id: id.substring(0, 12),
    name: info.Name,
    ipv4: info.IPv4Address,
    ipv6: info.IPv6Address,
    mac: info.MacAddress,
  }));
}

/**
 * Check if network is a system network (should not be deleted)
 * @param {string} name - Network name
 * @returns {boolean}
 */
export function isSystemNetwork(name) {
  const systemNetworks = ['bridge', 'host', 'none'];
  return systemNetworks.includes(name);
}

export default {
  getNetworks,
  getNetwork,
  inspectNetwork,
  createNetwork,
  removeNetwork,
  pruneNetworks,
  connectContainer,
  disconnectContainer,
  getNetworkContainers,
  isSystemNetwork,
};
