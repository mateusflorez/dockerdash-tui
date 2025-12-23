/**
 * Format bytes to human readable string
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Decimal places
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format uptime to human readable string
 * @param {number} seconds - Uptime in seconds
 * @returns {string}
 */
export function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format Docker ports array to readable string
 * @param {Array} ports - Array of port objects
 * @returns {string}
 */
export function formatPorts(ports) {
  if (!ports || ports.length === 0) return '-';

  return ports
    .filter((p) => p.PublicPort)
    .map((p) => `${p.PublicPort}->${p.PrivatePort}`)
    .join(', ') || '-';
}

/**
 * Format CPU percentage
 * @param {number} cpuDelta - CPU delta
 * @param {number} systemDelta - System delta
 * @param {number} cpuCount - Number of CPUs
 * @returns {string}
 */
export function formatCpuPercent(cpuDelta, systemDelta, cpuCount) {
  if (systemDelta === 0) return '0.00%';
  const percent = (cpuDelta / systemDelta) * cpuCount * 100;
  return percent.toFixed(2) + '%';
}

/**
 * Format memory usage
 * @param {number} used - Memory used in bytes
 * @param {number} limit - Memory limit in bytes
 * @returns {string}
 */
export function formatMemory(used, limit) {
  const percent = ((used / limit) * 100).toFixed(1);
  return `${formatBytes(used)} / ${formatBytes(limit)} (${percent}%)`;
}

/**
 * Create ASCII progress bar
 * @param {number} percent - Percentage (0-100)
 * @param {number} width - Bar width in characters
 * @returns {string}
 */
export function createProgressBar(percent, width = 40) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Truncate string with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
export function truncate(str, maxLength) {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Format container state with color indicator
 * @param {string} state - Container state
 * @returns {string}
 */
export function getStateEmoji(state) {
  const states = {
    running: '●',
    exited: '○',
    paused: '◐',
    restarting: '↻',
    dead: '✕',
  };
  return states[state] || '?';
}
