import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';

const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
];

/**
 * Find compose files in a directory
 * @param {string} dir - Directory to search
 * @returns {string[]} - Array of compose file paths
 */
export function findComposeFiles(dir = process.cwd()) {
  const found = [];

  for (const file of COMPOSE_FILES) {
    const path = join(dir, file);
    if (existsSync(path)) {
      found.push(path);
    }
  }

  return found;
}

/**
 * Detect compose project from container labels
 * @param {Object} container - Container info from Docker API
 * @returns {Object|null} - Compose project info or null
 */
export function getComposeInfo(container) {
  const labels = container.Labels || {};

  const projectName = labels['com.docker.compose.project'] || null;
  const serviceName = labels['com.docker.compose.service'] || null;
  const workingDir = labels['com.docker.compose.project.working_dir'] || null;
  const configFiles = labels['com.docker.compose.project.config_files'] || null;

  if (!projectName) return null;

  return {
    projectName,
    serviceName,
    workingDir,
    configFiles: configFiles ? configFiles.split(',') : [],
  };
}

/**
 * Group containers by compose project
 * @param {Array} containers - List of containers
 * @returns {Map<string, Array>} - Map of project name to containers
 */
export function groupByComposeProject(containers) {
  const projects = new Map();

  for (const container of containers) {
    const info = getComposeInfo(container);

    if (info) {
      if (!projects.has(info.projectName)) {
        projects.set(info.projectName, {
          name: info.projectName,
          workingDir: info.workingDir,
          configFiles: info.configFiles,
          services: [],
        });
      }
      projects.get(info.projectName).services.push({
        ...container,
        serviceName: info.serviceName,
      });
    }
  }

  return projects;
}

/**
 * Execute docker compose command
 * @param {string[]} args - Command arguments
 * @param {Object} options - Execution options
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
export function execCompose(args, options = {}) {
  const { cwd = process.cwd(), onOutput = null } = options;

  return new Promise((resolve, reject) => {
    // Try docker compose (v2) first, fallback to docker-compose
    const proc = spawn('docker', ['compose', ...args], {
      cwd,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      if (onOutput) onOutput(str, 'stdout');
    });

    proc.stderr.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      if (onOutput) onOutput(str, 'stderr');
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      // Try legacy docker-compose
      const legacyProc = spawn('docker-compose', args, {
        cwd,
        shell: true,
      });

      stdout = '';
      stderr = '';

      legacyProc.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        if (onOutput) onOutput(str, 'stdout');
      });

      legacyProc.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        if (onOutput) onOutput(str, 'stderr');
      });

      legacyProc.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      legacyProc.on('error', () => {
        reject(new Error('Docker Compose not found'));
      });
    });
  });
}

/**
 * Get compose project status
 * @param {string} projectDir - Project directory
 * @returns {Promise<Object>}
 */
export async function getComposeStatus(projectDir) {
  const result = await execCompose(['ps', '--format', 'json'], { cwd: projectDir });

  if (result.code !== 0) {
    return { services: [], error: result.stderr };
  }

  try {
    // Parse JSON output (one object per line)
    const services = result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    return { services, error: null };
  } catch {
    return { services: [], error: 'Failed to parse compose status' };
  }
}

/**
 * Start compose project
 * @param {string} projectDir - Project directory
 * @param {Object} options - Start options
 * @returns {Promise<Object>}
 */
export async function composeUp(projectDir, options = {}) {
  const { detach = true, build = false, onOutput = null } = options;

  const args = ['up'];
  if (detach) args.push('-d');
  if (build) args.push('--build');

  return execCompose(args, { cwd: projectDir, onOutput });
}

/**
 * Stop compose project
 * @param {string} projectDir - Project directory
 * @returns {Promise<Object>}
 */
export async function composeDown(projectDir, options = {}) {
  const { removeVolumes = false, onOutput = null } = options;

  const args = ['down'];
  if (removeVolumes) args.push('-v');

  return execCompose(args, { cwd: projectDir, onOutput });
}

/**
 * Restart compose service
 * @param {string} projectDir - Project directory
 * @param {string} service - Service name
 * @returns {Promise<Object>}
 */
export async function composeRestart(projectDir, service = null) {
  const args = ['restart'];
  if (service) args.push(service);

  return execCompose(args, { cwd: projectDir });
}

/**
 * Rebuild compose service
 * @param {string} projectDir - Project directory
 * @param {string} service - Service name
 * @param {Object} options - Build options
 * @returns {Promise<Object>}
 */
export async function composeRebuild(projectDir, service = null, options = {}) {
  const { noCache = false, onOutput = null } = options;

  // Build
  const buildArgs = ['build'];
  if (noCache) buildArgs.push('--no-cache');
  if (service) buildArgs.push(service);

  const buildResult = await execCompose(buildArgs, { cwd: projectDir, onOutput });

  if (buildResult.code !== 0) {
    return buildResult;
  }

  // Recreate
  const upArgs = ['up', '-d', '--force-recreate'];
  if (service) upArgs.push(service);

  return execCompose(upArgs, { cwd: projectDir, onOutput });
}

/**
 * Get compose logs
 * @param {string} projectDir - Project directory
 * @param {string} service - Service name
 * @param {Object} options - Log options
 * @returns {Promise<Object>}
 */
export async function composeLogs(projectDir, service = null, options = {}) {
  const { tail = 100, follow = false } = options;

  const args = ['logs', `--tail=${tail}`];
  if (follow) args.push('-f');
  if (service) args.push(service);

  return execCompose(args, { cwd: projectDir });
}

export default {
  findComposeFiles,
  getComposeInfo,
  groupByComposeProject,
  execCompose,
  getComposeStatus,
  composeUp,
  composeDown,
  composeRestart,
  composeRebuild,
  composeLogs,
};
