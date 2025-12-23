import chalk from 'chalk';

/**
 * Create an ASCII progress bar with percentage
 * @param {number} percent - Percentage (0-100)
 * @param {number} width - Bar width in characters
 * @param {Object} options - Display options
 * @returns {string}
 */
export function progressBar(percent, width = 30, options = {}) {
  const { showPercent = true, colorize = true } = options;
  const safePercent = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safePercent / 100) * width);
  const empty = width - filled;

  let color = chalk.green;
  if (colorize) {
    if (safePercent > 80) color = chalk.red;
    else if (safePercent > 60) color = chalk.yellow;
  }

  const bar = color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  return showPercent ? `${bar} ${safePercent.toFixed(1).padStart(5)}%` : bar;
}

/**
 * Create a sparkline chart from data points
 * @param {number[]} data - Array of values
 * @param {Object} options - Chart options
 * @returns {string}
 */
export function sparkline(data, options = {}) {
  const { width = 20, min = null, max = null } = options;
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

  if (!data || data.length === 0) return chalk.gray('─'.repeat(width));

  const dataMin = min !== null ? min : Math.min(...data);
  const dataMax = max !== null ? max : Math.max(...data);
  const range = dataMax - dataMin || 1;

  // Take last 'width' points or pad with zeros
  const points = data.slice(-width);
  while (points.length < width) points.unshift(dataMin);

  return points
    .map((value) => {
      const normalized = (value - dataMin) / range;
      const index = Math.min(chars.length - 1, Math.floor(normalized * chars.length));
      return chalk.cyan(chars[index]);
    })
    .join('');
}

/**
 * Create a mini bar chart for multiple values
 * @param {Object} data - Object with label: value pairs
 * @param {Object} options - Chart options
 * @returns {string}
 */
export function miniBarChart(data, options = {}) {
  const { width = 20, maxValue = null } = options;
  const entries = Object.entries(data);
  const max = maxValue || Math.max(...entries.map(([, v]) => v)) || 1;

  return entries
    .map(([label, value]) => {
      const barWidth = Math.round((value / max) * width);
      const bar = chalk.cyan('█'.repeat(barWidth)) + chalk.gray('░'.repeat(width - barWidth));
      return `${label.padEnd(10)} ${bar} ${value}`;
    })
    .join('\n');
}

/**
 * Create a horizontal gauge
 * @param {number} value - Current value
 * @param {number} maxValue - Maximum value
 * @param {string} label - Gauge label
 * @param {number} width - Gauge width
 * @returns {string}
 */
export function gauge(value, maxValue, label, width = 30) {
  const percent = (value / maxValue) * 100;
  const bar = progressBar(percent, width, { showPercent: false });
  return `${chalk.bold(label.padEnd(12))} ${bar} ${value.toFixed(1)}/${maxValue.toFixed(1)}`;
}

/**
 * Format bytes with color based on size
 * @param {number} bytes - Bytes value
 * @returns {string}
 */
export function coloredBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const formatted = `${value.toFixed(1)} ${units[unitIndex]}`;

  if (unitIndex >= 3) return chalk.red(formatted); // GB+
  if (unitIndex >= 2) return chalk.yellow(formatted); // MB
  return chalk.green(formatted);
}

/**
 * Create a box around content
 * @param {string} title - Box title
 * @param {string[]} lines - Content lines
 * @param {number} width - Box width
 * @returns {string}
 */
export function box(title, lines, width = 50) {
  const innerWidth = width - 4;
  const top = `┌─ ${chalk.bold(title)} ${'─'.repeat(innerWidth - title.length - 1)}┐`;
  const bottom = `└${'─'.repeat(width - 2)}┘`;

  const content = lines.map((line) => {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = Math.max(0, innerWidth - stripped.length);
    return `│ ${line}${' '.repeat(padding)} │`;
  });

  return [top, ...content, bottom].join('\n');
}

export default {
  progressBar,
  sparkline,
  miniBarChart,
  gauge,
  coloredBytes,
  box,
};
