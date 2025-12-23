import { spawn } from 'child_process';
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

/**
 * Check which shell is available in the container
 * @param {string} idOrName - Container ID or name
 * @returns {Promise<string>} - Available shell path
 */
export async function detectShell(idOrName) {
  const container = getContainer(idOrName);

  // Try common shells in order of preference
  const shells = ['/bin/bash', '/bin/sh', '/bin/ash', '/bin/zsh'];

  for (const shell of shells) {
    try {
      const exec = await container.exec({
        Cmd: ['test', '-x', shell],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ Detach: false });

      await new Promise((resolve) => {
        stream.on('end', resolve);
        stream.on('error', resolve);
      });

      const inspect = await exec.inspect();
      if (inspect.ExitCode === 0) {
        return shell;
      }
    } catch {
      continue;
    }
  }

  return '/bin/sh'; // Fallback
}

/**
 * Open interactive shell in container
 * @param {string} idOrName - Container ID or name
 * @param {Object} options - Shell options
 * @returns {Promise<number>} - Exit code
 */
export function openInteractiveShell(idOrName, options = {}) {
  const { shell = '/bin/sh', workdir = null, user = null } = options;

  return new Promise((resolve, reject) => {
    const args = ['exec', '-it'];

    if (workdir) {
      args.push('-w', workdir);
    }

    if (user) {
      args.push('-u', user);
    }

    args.push(idOrName, shell);

    const proc = spawn('docker', args, {
      stdio: 'inherit',
      shell: false,
    });

    proc.on('close', (code) => {
      resolve(code);
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Execute a single command in container and return output
 * @param {string} idOrName - Container ID or name
 * @param {string} command - Command to run
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
export function execCommand(idOrName, command) {
  return new Promise((resolve, reject) => {
    const args = ['exec', idOrName, 'sh', '-c', command];

    const proc = spawn('docker', args, { shell: false });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}
