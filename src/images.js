import { spawn } from 'child_process';
import docker, { listImages, getImage, getContainer } from './docker.js';
import { formatBytes } from './utils/format.js';

/**
 * Get all images with formatted info
 * @returns {Promise<Array>}
 */
export async function getImages() {
  const images = await listImages();

  return images.map((image) => {
    const repoTags = image.RepoTags || ['<none>:<none>'];
    const [repository, tag] = repoTags[0].split(':');

    return {
      id: image.Id.replace('sha256:', '').substring(0, 12),
      repository: repository || '<none>',
      tag: tag || '<none>',
      size: formatBytes(image.Size),
      sizeBytes: image.Size,
      created: new Date(image.Created * 1000).toLocaleDateString(),
      createdAt: image.Created,
    };
  });
}

/**
 * Remove an image
 * @param {string} imageId - Image ID or name
 * @param {boolean} force - Force removal
 * @returns {Promise<void>}
 */
export async function removeImage(imageId, force = false) {
  const image = getImage(imageId);
  await image.remove({ force });
}

/**
 * Get container's image info
 * @param {string} containerId - Container ID or name
 * @returns {Promise<Object>}
 */
export async function getContainerImage(containerId) {
  const container = getContainer(containerId);
  const info = await container.inspect();

  return {
    imageId: info.Image,
    imageName: info.Config.Image,
  };
}

/**
 * Build image from Dockerfile
 * @param {string} context - Build context path
 * @param {Object} options - Build options
 * @returns {Promise<Object>}
 */
export function buildImage(context, options = {}) {
  const {
    dockerfile = 'Dockerfile',
    tag = null,
    noCache = false,
    onOutput = null,
  } = options;

  return new Promise((resolve, reject) => {
    const args = ['build', context];

    if (dockerfile !== 'Dockerfile') {
      args.push('-f', dockerfile);
    }
    if (tag) {
      args.push('-t', tag);
    }
    if (noCache) {
      args.push('--no-cache');
    }

    const proc = spawn('docker', args, { shell: true });

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
      reject(err);
    });
  });
}

/**
 * Quick rebuild: stop container, rebuild image, recreate container
 * @param {string} containerId - Container ID or name
 * @param {Object} options - Rebuild options
 * @returns {Promise<Object>}
 */
export async function quickRebuild(containerId, options = {}) {
  const { noCache = false, onOutput = null } = options;

  const log = (msg) => {
    if (onOutput) onOutput(msg + '\n', 'info');
  };

  try {
    // 1. Get container info
    log('Inspecting container...');
    const container = getContainer(containerId);
    const info = await container.inspect();

    const imageName = info.Config.Image;
    const wasRunning = info.State.Running;

    // Check if this is a compose container
    const composeProject = info.Config.Labels?.['com.docker.compose.project'];
    const composeService = info.Config.Labels?.['com.docker.compose.service'];
    const composeWorkingDir = info.Config.Labels?.['com.docker.compose.project.working_dir'];

    if (composeProject && composeWorkingDir) {
      // Use docker compose for rebuild
      log(`Detected Compose project: ${composeProject}`);
      log(`Rebuilding service: ${composeService}`);

      const { composeRebuild } = await import('./compose.js');
      const result = await composeRebuild(composeWorkingDir, composeService, {
        noCache,
        onOutput,
      });

      return {
        success: result.code === 0,
        method: 'compose',
        project: composeProject,
        service: composeService,
        output: result.stdout + result.stderr,
      };
    }

    // 2. Stop container if running
    if (wasRunning) {
      log('Stopping container...');
      await container.stop();
    }

    // 3. Get container config for recreation
    const containerConfig = {
      Image: imageName,
      name: info.Name.replace(/^\//, ''),
      Hostname: info.Config.Hostname,
      Env: info.Config.Env,
      Cmd: info.Config.Cmd,
      ExposedPorts: info.Config.ExposedPorts,
      HostConfig: info.HostConfig,
      NetworkingConfig: {
        EndpointsConfig: info.NetworkSettings.Networks,
      },
    };

    // 4. Check if we can build (need build context)
    // For now, just pull if it's a remote image or skip build for local
    const isLocalBuild = !imageName.includes('/') || imageName.startsWith('localhost');

    if (!isLocalBuild) {
      // Pull latest image
      log(`Pulling latest image: ${imageName}`);
      await new Promise((resolve, reject) => {
        docker.pull(imageName, (err, stream) => {
          if (err) return reject(err);

          docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            resolve(output);
          }, (event) => {
            if (event.status && onOutput) {
              onOutput(`${event.status} ${event.progress || ''}\n`, 'stdout');
            }
          });
        });
      });
    }

    // 5. Remove old container
    log('Removing old container...');
    await container.remove();

    // 6. Create new container
    log('Creating new container...');
    const newContainer = await docker.createContainer(containerConfig);

    // 7. Start if was running
    if (wasRunning) {
      log('Starting container...');
      await newContainer.start();
    }

    log('Rebuild complete!');

    return {
      success: true,
      method: 'docker',
      containerId: newContainer.id,
      imageName,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Prune unused images
 * @returns {Promise<Object>}
 */
export async function pruneImages() {
  return docker.pruneImages();
}

export default {
  getImages,
  removeImage,
  getContainerImage,
  buildImage,
  quickRebuild,
  pruneImages,
};
