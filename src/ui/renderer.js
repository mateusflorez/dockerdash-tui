import chalk from 'chalk';

/**
 * Flicker-free terminal renderer
 * Uses ANSI escape codes to update in place without clearing screen
 */
class Renderer {
  constructor() {
    this.lastLineCount = 0;
    this.isFirstRender = true;
  }

  /**
   * Clear the renderer state
   */
  reset() {
    this.lastLineCount = 0;
    this.isFirstRender = true;
  }

  /**
   * Render content without flicker
   * Moves cursor up and overwrites previous content
   * @param {string} content - Content to render
   */
  render(content) {
    const lines = content.split('\n');
    const lineCount = lines.length;

    if (!this.isFirstRender && this.lastLineCount > 0) {
      // Move cursor up to the start of previous content
      process.stdout.write(`\x1b[${this.lastLineCount}A`);
    }

    // Clear each line and write new content
    for (let i = 0; i < lineCount; i++) {
      // Clear line from cursor to end
      process.stdout.write('\x1b[2K');
      // Write the line
      process.stdout.write(lines[i]);
      // Move to next line (except for last line)
      if (i < lineCount - 1) {
        process.stdout.write('\n');
      }
    }

    // Clear any remaining lines from previous render
    if (this.lastLineCount > lineCount) {
      const extraLines = this.lastLineCount - lineCount;
      for (let i = 0; i < extraLines; i++) {
        process.stdout.write('\n\x1b[2K');
      }
      // Move cursor back up
      process.stdout.write(`\x1b[${extraLines}A`);
    }

    process.stdout.write('\n');
    this.lastLineCount = lineCount;
    this.isFirstRender = false;
  }

  /**
   * Clear the rendered area
   */
  clear() {
    if (this.lastLineCount > 0) {
      process.stdout.write(`\x1b[${this.lastLineCount}A`);
      for (let i = 0; i < this.lastLineCount; i++) {
        process.stdout.write('\x1b[2K\n');
      }
      process.stdout.write(`\x1b[${this.lastLineCount}A`);
    }
    this.reset();
  }
}

/**
 * Hide cursor
 */
export function hideCursor() {
  process.stdout.write('\x1b[?25l');
}

/**
 * Show cursor
 */
export function showCursor() {
  process.stdout.write('\x1b[?25h');
}

/**
 * Move cursor to position
 * @param {number} row - Row (1-based)
 * @param {number} col - Column (1-based)
 */
export function moveCursor(row, col) {
  process.stdout.write(`\x1b[${row};${col}H`);
}

/**
 * Clear line
 */
export function clearLine() {
  process.stdout.write('\x1b[2K');
}

/**
 * Get terminal size
 * @returns {{rows: number, cols: number}}
 */
export function getTerminalSize() {
  return {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
  };
}

export { Renderer };
export default new Renderer();
