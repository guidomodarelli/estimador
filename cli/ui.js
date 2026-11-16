/**
 * Helpers de presentación de la CLI. Degradan a texto plano si NO_COLOR está definida,
 * si la salida no es una TTY o si la terminal es "dumb".
 */

const ANSI_COLORS = Object.freeze({
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m',
});

export const STATUS_SYMBOLS = Object.freeze({ done: '✔', skipped: '↷', changed: '●', warning: '⚠', error: '✖' });
const PLAIN_STATUS_SYMBOLS = Object.freeze({ done: '[ok]', skipped: '[--]', changed: '[*]', warning: '[!]', error: '[x]' });
const STATUS_COLOR = Object.freeze({ done: 'green', skipped: 'dim', changed: 'cyan', warning: 'yellow', error: 'red' });

/** @param {NodeJS.WriteStream} stream */
export function supportsColor(stream, environment = process.env) {
  if ('NO_COLOR' in environment) return false;
  if (environment.TERM === 'dumb') return false;
  return Boolean(stream.isTTY);
}

/**
 * @param {{stream: NodeJS.WriteStream, colorEnabled: boolean}} options
 */
export function createUi({ stream, colorEnabled }) {
  const paint = (colorName, text) => (colorEnabled ? `${ANSI_COLORS[colorName]}${text}${ANSI_COLORS.reset}` : text);
  const symbols = colorEnabled ? STATUS_SYMBOLS : PLAIN_STATUS_SYMBOLS;
  const write = (line = '') => stream.write(`${line}\n`);

  return {
    paint,
    write,
    banner(title, subtitle) {
      write(paint('bold', paint('magenta', `◆ ${title}`)));
      if (subtitle) write(paint('dim', `  ${subtitle}`));
      write();
    },
    step(index, total, title) {
      write(`${paint('cyan', `[${index}/${total}]`)} ${paint('bold', title)}`);
    },
    status(kind, message) {
      write(`      ${paint(STATUS_COLOR[kind], symbols[kind])} ${message}`);
    },
    table(headers, rows, alignRight = []) {
      const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => String(row[column]).length)));
      const format = (cells) =>
        cells.map((cell, column) => (alignRight.includes(column) ? String(cell).padStart(widths[column]) : String(cell).padEnd(widths[column]))).join('  ');
      write(`  ${paint('bold', format(headers))}`);
      write(`  ${paint('dim', widths.map((width) => '─'.repeat(width)).join('  '))}`);
      for (const row of rows) write(`  ${format(row)}`);
    },
    box(title, lines) {
      const width = Math.max(title.length, ...lines.map((line) => line.length)) + 2;
      const border = (text) => paint('green', text);
      write(border(`╭${'─'.repeat(width)}╮`));
      write(`${border('│')} ${paint('bold', title.padEnd(width - 1))}${border('│')}`);
      write(border(`├${'─'.repeat(width)}┤`));
      for (const line of lines) write(`${border('│')} ${line.padEnd(width - 1)}${border('│')}`);
      write(border(`╰${'─'.repeat(width)}╯`));
    },
    error(message) {
      write(`${paint('red', `${symbols.error} Error:`)} ${message}`);
    },
  };
}
