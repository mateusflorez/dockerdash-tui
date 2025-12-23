import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.config', 'dockerdash');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  refreshInterval: 2000, // ms
  logTail: 100,
  showAllContainers: true,
  theme: 'default',
};

/**
 * Load configuration from file
 * @returns {Object}
 */
export function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = readFileSync(CONFIG_FILE, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch {
    // Ignore errors, use defaults
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to file
 * @param {Object} config - Configuration object
 */
export function saveConfig(config) {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {
    // Ignore save errors
  }
}

/**
 * Get a specific config value
 * @param {string} key - Config key
 * @returns {*}
 */
export function getConfig(key) {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a specific config value
 * @param {string} key - Config key
 * @param {*} value - Config value
 */
export function setConfig(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

export default {
  loadConfig,
  saveConfig,
  getConfig,
  setConfig,
  DEFAULT_CONFIG,
};
