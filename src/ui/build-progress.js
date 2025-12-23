import chalk from 'chalk';
import { progressBar, box } from './charts.js';

/**
 * Parse Docker build output to extract step information
 * @param {string} output - Build output line
 * @returns {Object|null} - Parsed step info
 */
export function parseBuildStep(output) {
  // Match: Step 1/5 : FROM node:20
  const stepMatch = output.match(/Step\s+(\d+)\/(\d+)\s*:\s*(.+)/i);
  if (stepMatch) {
    return {
      type: 'step',
      current: parseInt(stepMatch[1], 10),
      total: parseInt(stepMatch[2], 10),
      instruction: stepMatch[3].trim(),
    };
  }

  // Match: ---> Using cache
  if (output.includes('Using cache')) {
    return { type: 'cache', cached: true };
  }

  // Match: ---> Running in abc123
  const runningMatch = output.match(/--->\s*Running in\s+([a-f0-9]+)/i);
  if (runningMatch) {
    return { type: 'running', containerId: runningMatch[1] };
  }

  // Match: ---> abc123def456
  const layerMatch = output.match(/--->\s*([a-f0-9]{12})/i);
  if (layerMatch) {
    return { type: 'layer', layerId: layerMatch[1] };
  }

  // Match: Successfully built abc123
  const successMatch = output.match(/Successfully built\s+([a-f0-9]+)/i);
  if (successMatch) {
    return { type: 'success', imageId: successMatch[1] };
  }

  // Match: Successfully tagged myimage:latest
  const taggedMatch = output.match(/Successfully tagged\s+(.+)/i);
  if (taggedMatch) {
    return { type: 'tagged', tag: taggedMatch[1].trim() };
  }

  // Match download/extract progress: abc123: Downloading [====>    ] 1.2MB/5MB
  const downloadMatch = output.match(/([a-f0-9]+):\s*(Downloading|Extracting)\s*\[([=>\s]+)\]\s*([\d.]+[KMGT]?B)\/([\d.]+[KMGT]?B)/i);
  if (downloadMatch) {
    return {
      type: 'download',
      layerId: downloadMatch[1],
      action: downloadMatch[2].toLowerCase(),
      current: downloadMatch[4],
      total: downloadMatch[5],
    };
  }

  // Match: Pulling from library/node
  const pullMatch = output.match(/Pulling from\s+(.+)/i);
  if (pullMatch) {
    return { type: 'pull', image: pullMatch[1].trim() };
  }

  // Match error
  if (output.toLowerCase().includes('error')) {
    return { type: 'error', message: output.trim() };
  }

  return null;
}

/**
 * Build progress state tracker
 */
export class BuildProgressTracker {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 0;
    this.currentInstruction = '';
    this.logs = [];
    this.errors = [];
    this.cachedSteps = 0;
    this.startTime = Date.now();
    this.imageId = null;
    this.tag = null;
    this.downloadProgress = new Map();
  }

  /**
   * Process build output line
   * @param {string} line - Output line
   */
  processLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    this.logs.push(trimmed);
    if (this.logs.length > 100) {
      this.logs.shift();
    }

    const parsed = parseBuildStep(trimmed);
    if (!parsed) return;

    switch (parsed.type) {
      case 'step':
        this.currentStep = parsed.current;
        this.totalSteps = parsed.total;
        this.currentInstruction = parsed.instruction;
        break;
      case 'cache':
        this.cachedSteps++;
        break;
      case 'success':
        this.imageId = parsed.imageId;
        break;
      case 'tagged':
        this.tag = parsed.tag;
        break;
      case 'error':
        this.errors.push(parsed.message);
        break;
      case 'download':
        this.downloadProgress.set(parsed.layerId, {
          action: parsed.action,
          current: parsed.current,
          total: parsed.total,
        });
        break;
    }
  }

  /**
   * Get elapsed time formatted
   * @returns {string}
   */
  getElapsedTime() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }

  /**
   * Get build progress percentage
   * @returns {number}
   */
  getProgressPercent() {
    if (this.totalSteps === 0) return 0;
    return Math.round((this.currentStep / this.totalSteps) * 100);
  }
}

/**
 * Render build progress UI
 * @param {BuildProgressTracker} tracker - Progress tracker
 * @param {Object} options - Render options
 * @returns {string}
 */
export function renderBuildProgress(tracker, options = {}) {
  const { width = 60 } = options;
  const lines = [];

  // Header
  const percent = tracker.getProgressPercent();
  const stepInfo = tracker.totalSteps > 0
    ? `Step ${tracker.currentStep}/${tracker.totalSteps}`
    : 'Initializing...';

  lines.push(chalk.bold(`Build Progress: ${stepInfo}`));
  lines.push(progressBar(percent, width - 10));
  lines.push('');

  // Current instruction
  if (tracker.currentInstruction) {
    const instruction = tracker.currentInstruction.length > width - 4
      ? tracker.currentInstruction.substring(0, width - 7) + '...'
      : tracker.currentInstruction;
    lines.push(chalk.cyan(`> ${instruction}`));
    lines.push('');
  }

  // Download progress if any
  if (tracker.downloadProgress.size > 0) {
    lines.push(chalk.gray('Download Progress:'));
    for (const [layerId, progress] of tracker.downloadProgress) {
      const label = `${layerId.substring(0, 8)}: ${progress.action}`;
      lines.push(chalk.gray(`  ${label.padEnd(25)} ${progress.current}/${progress.total}`));
    }
    lines.push('');
  }

  // Stats
  lines.push(chalk.gray(`Time: ${tracker.getElapsedTime()} | Cached: ${tracker.cachedSteps} steps`));

  // Recent logs (last 5)
  if (tracker.logs.length > 0) {
    lines.push('');
    lines.push(chalk.gray('Recent output:'));
    const recentLogs = tracker.logs.slice(-5);
    for (const log of recentLogs) {
      const truncated = log.length > width - 4 ? log.substring(0, width - 7) + '...' : log;
      lines.push(chalk.gray(`  ${truncated}`));
    }
  }

  // Errors
  if (tracker.errors.length > 0) {
    lines.push('');
    lines.push(chalk.red('Errors:'));
    for (const error of tracker.errors.slice(-3)) {
      lines.push(chalk.red(`  ${error}`));
    }
  }

  return box('Building Image', lines, width);
}

/**
 * Render final build result
 * @param {BuildProgressTracker} tracker - Progress tracker
 * @param {boolean} success - Build success status
 * @returns {string}
 */
export function renderBuildResult(tracker, success) {
  const lines = [];

  if (success) {
    lines.push(chalk.green.bold('Build completed successfully!'));
    lines.push('');
    if (tracker.imageId) {
      lines.push(`${chalk.gray('Image ID:')} ${tracker.imageId}`);
    }
    if (tracker.tag) {
      lines.push(`${chalk.gray('Tagged:')} ${tracker.tag}`);
    }
    lines.push(`${chalk.gray('Duration:')} ${tracker.getElapsedTime()}`);
    lines.push(`${chalk.gray('Total Steps:')} ${tracker.totalSteps}`);
    lines.push(`${chalk.gray('Cached Steps:')} ${tracker.cachedSteps}`);
  } else {
    lines.push(chalk.red.bold('Build failed!'));
    lines.push('');
    lines.push(`${chalk.gray('Duration:')} ${tracker.getElapsedTime()}`);
    lines.push(`${chalk.gray('Failed at Step:')} ${tracker.currentStep}/${tracker.totalSteps}`);
    if (tracker.errors.length > 0) {
      lines.push('');
      lines.push(chalk.red('Errors:'));
      for (const error of tracker.errors) {
        lines.push(chalk.red(`  ${error}`));
      }
    }
  }

  return box('Build Result', lines, 60);
}

export default {
  parseBuildStep,
  BuildProgressTracker,
  renderBuildProgress,
  renderBuildResult,
};
