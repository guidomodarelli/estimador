import { escapeHtml } from './dom.js';

/**
 * Convierte a HTML el subconjunto de Markdown que genera `renderMarkdownSummary`:
 * títulos, párrafos, listas (con un nivel de anidado), tablas, citas y negritas.
 * Sirve para la vista previa de "Compartir": muestra lo que va a leer quien recibe el resumen.
 */

const HEADING_PATTERN = /^(#{1,3})\s+(.*)$/;
const LIST_ITEM_PATTERN = /^(\s*)-\s+(.*)$/;
const TABLE_SEPARATOR_PATTERN = /^\|?\s*:?-{3,}/;
const NESTED_LIST_INDENT = 2;

/** Negritas sobre texto ya escapado. */
const inlineHtml = (text) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const tableCells = (line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

function tableHtml(lines) {
  const [headerLine, separatorLine, ...bodyLines] = lines;
  const alignments = tableCells(separatorLine).map((cell) => (cell.endsWith(':') ? ' class="numeric"' : ''));
  const header = tableCells(headerLine).map((cell, index) => `<th${alignments[index] ?? ''}>${inlineHtml(cell)}</th>`).join('');
  const body = bodyLines
    .map((line) => `<tr>${tableCells(line).map((cell, index) => `<td${alignments[index] ?? ''}>${inlineHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="table-scroll"><table class="data-table compact"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function listHtml(lines) {
  let html = '<ul>';
  let nestedOpen = false;
  lines.forEach((line, index) => {
    const [, indent, text] = line.match(LIST_ITEM_PATTERN);
    const isNested = indent.length >= NESTED_LIST_INDENT;
    if (isNested && !nestedOpen) {
      html += '<ul>';
      nestedOpen = true;
    } else if (!isNested && nestedOpen) {
      html += '</ul></li>';
      nestedOpen = false;
    } else if (!isNested && index > 0) {
      html += '</li>';
    }
    html += isNested ? `<li>${inlineHtml(text)}</li>` : `<li>${inlineHtml(text)}`;
  });
  return `${html}${nestedOpen ? '</ul>' : ''}</li></ul>`;
}

/**
 * @param {string} markdown
 * @returns {string} HTML seguro (todo el texto se escapa antes de dar formato).
 */
export function markdownToHtml(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let index = 0;
  const collect = (predicate) => {
    const collected = [];
    while (index < lines.length && predicate(lines[index])) collected.push(lines[index++]);
    return collected;
  };

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
    } else if (HEADING_PATTERN.test(line)) {
      const [, hashes, text] = line.match(HEADING_PATTERN);
      blocks.push(`<h${hashes.length + 1}>${inlineHtml(text)}</h${hashes.length + 1}>`);
      index += 1;
    } else if (line.startsWith('|') && TABLE_SEPARATOR_PATTERN.test(lines[index + 1] ?? '')) {
      blocks.push(tableHtml(collect((candidate) => candidate.startsWith('|'))));
    } else if (LIST_ITEM_PATTERN.test(line)) {
      blocks.push(listHtml(collect((candidate) => LIST_ITEM_PATTERN.test(candidate))));
    } else if (line.startsWith('>')) {
      const quoted = collect((candidate) => candidate.startsWith('>')).map((candidate) => candidate.replace(/^>\s?/, ''));
      blocks.push(`<blockquote>${quoted.map(inlineHtml).join('<br>')}</blockquote>`);
    } else {
      const paragraph = collect((candidate) => candidate.trim() && !HEADING_PATTERN.test(candidate) && !candidate.startsWith('|') && !LIST_ITEM_PATTERN.test(candidate) && !candidate.startsWith('>'));
      blocks.push(`<p>${paragraph.map(inlineHtml).join(' ')}</p>`);
    }
  }
  return blocks.join('');
}
