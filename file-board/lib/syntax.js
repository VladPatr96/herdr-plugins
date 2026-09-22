'use strict';

// Enough syntax to read by, and not one bit more.
//
// No dependencies and no grammars: a table of rules per language and a single
// pass over each line. That buys comments, strings, numbers and keywords, which
// is what tells code apart at a glance in a pane six inches wide. It does not
// buy correctness on pathological input, and it does not have to — the worst a
// wrong guess costs here is a word in the wrong colour. The one thing it must
// never do is change the text, and a test holds it to that.

const path = require('node:path');

const { styleFor } = require('./paint');

const CODE_KEYWORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
  'break', 'continue', 'class', 'new', 'this', 'super', 'extends', 'import', 'export', 'from',
  'default', 'async', 'await', 'yield', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
  'in', 'of', 'delete', 'void', 'null', 'undefined', 'true', 'false', 'static', 'get', 'set',
  'interface', 'type', 'enum', 'struct', 'impl', 'fn', 'pub', 'mut', 'match', 'use', 'package',
  'public', 'private', 'protected', 'func', 'defer', 'go', 'nil', 'self',
];

const SHELL_KEYWORDS = [
  'if', 'then', 'elif', 'else', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'in',
  'function', 'return', 'export', 'local', 'source', 'set', 'echo', 'exit', 'param', 'foreach',
];

const PYTHON_KEYWORDS = [
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try',
  'except', 'finally', 'with', 'lambda', 'pass', 'raise', 'yield', 'global', 'nonlocal', 'async',
  'await', 'break', 'continue', 'not', 'and', 'or', 'is', 'in', 'None', 'True', 'False', 'self',
];

// `quotes` is the set of characters that open a string, `line` and `block` the
// comment markers, `keys` whether a name before a colon or an equals sign is
// worth colouring on its own.
const LANGUAGES = {
  'c-like': { line: '//', block: ['/*', '*/'], quotes: '"\'`', keywords: CODE_KEYWORDS },
  json: { quotes: '"', keywords: ['true', 'false', 'null'], keys: true },
  toml: { line: '#', quotes: '"\'', keywords: ['true', 'false'], keys: true, bareKeys: true, sections: true },
  shell: { line: '#', quotes: '"\'', keywords: SHELL_KEYWORDS },
  python: { line: '#', quotes: '"\'', keywords: PYTHON_KEYWORDS },
  markdown: { markdown: true },
};

const BY_EXTENSION = {
  js: 'c-like', mjs: 'c-like', cjs: 'c-like', jsx: 'c-like', ts: 'c-like', tsx: 'c-like',
  c: 'c-like', h: 'c-like', cpp: 'c-like', hpp: 'c-like', cs: 'c-like', java: 'c-like',
  go: 'c-like', rs: 'c-like', php: 'c-like', swift: 'c-like', kt: 'c-like', css: 'c-like',
  scss: 'c-like',
  json: 'json',
  toml: 'toml', ini: 'toml', cfg: 'toml', conf: 'toml', yaml: 'toml', yml: 'toml',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ps1: 'shell', psm1: 'shell',
  py: 'python',
  md: 'markdown', markdown: 'markdown',
};

function languageFor(file) {
  return BY_EXTENSION[path.extname(file).slice(1).toLowerCase()] ?? null;
}

// Collects segments while merging everything uncoloured into one run, so a line
// of ordinary code is one segment rather than one per character.
function collector() {
  const segments = [];
  let plain = '';
  return {
    plain(text) {
      plain += text;
    },
    styled(text, style) {
      if (plain) {
        segments.push({ text: plain, sgr: '' });
        plain = '';
      }
      segments.push({ text, sgr: styleFor(style) });
    },
    done() {
      if (plain) segments.push({ text: plain, sgr: '' });
      // An empty line is still a line; the pane has to be handed something.
      return segments.length > 0 ? segments : [{ text: '', sgr: '' }];
    },
  };
}

// Where a string that opened at `at` ends. A backslash takes the next character
// with it, and a string left open at the end of the line ends there: carrying
// it to the next line would paint half the file green over one stray quote.
function endOfString(text, at) {
  const quote = text[at];
  let end = at + 1;
  while (end < text.length) {
    if (text[end] === '\\') {
      end += 2;
      continue;
    }
    if (text[end] === quote) return end + 1;
    end += 1;
  }
  return text.length;
}

function isWordCharacter(character) {
  return character !== undefined && /[A-Za-z0-9_$]/.test(character);
}

function tokenizeCode(text, rules, state) {
  const out = collector();
  let at = 0;
  let block = state.block === true;

  if (block) {
    const closes = text.indexOf(rules.block[1]);
    if (closes < 0) return { segments: [{ text, sgr: styleFor('comment') }], state: { block: true } };
    at = closes + rules.block[1].length;
    out.styled(text.slice(0, at), 'comment');
    block = false;
  }

  if (at === 0 && rules.sections && /^\s*\[/.test(text)) {
    return { segments: [{ text, sgr: styleFor('key') }], state: { block: false } };
  }
  if (at === 0 && rules.bareKeys) {
    const name = /^(\s*)([A-Za-z0-9_.-]+)(?=\s*[=:])/.exec(text);
    if (name) {
      out.plain(name[1]);
      out.styled(name[2], 'key');
      at = name[0].length;
    }
  }

  while (at < text.length) {
    const rest = text.slice(at);

    if (rules.block && rest.startsWith(rules.block[0])) {
      const closes = rest.indexOf(rules.block[1], rules.block[0].length);
      if (closes < 0) {
        out.styled(rest, 'comment');
        block = true;
        at = text.length;
        break;
      }
      const token = rest.slice(0, closes + rules.block[1].length);
      out.styled(token, 'comment');
      at += token.length;
      continue;
    }
    if (rules.line && rest.startsWith(rules.line)) {
      out.styled(rest, 'comment');
      at = text.length;
      break;
    }

    const character = text[at];
    if (rules.quotes && rules.quotes.includes(character)) {
      const end = endOfString(text, at);
      const token = text.slice(at, end);
      // A quoted name with a colon after it is a key, not a value. This is what
      // makes a JSON file readable at a glance.
      const isKey = rules.keys && /^\s*:/.test(text.slice(end));
      out.styled(token, isKey ? 'key' : 'string');
      at = end;
      continue;
    }
    if (/[0-9]/.test(character) && !isWordCharacter(text[at - 1])) {
      const [token] = /^[0-9][0-9_a-fA-FxX.]*/.exec(rest);
      out.styled(token, 'number');
      at += token.length;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const [word] = /^[A-Za-z0-9_$]+/.exec(rest);
      if (rules.keywords.includes(word)) out.styled(word, 'keyword');
      else out.plain(word);
      at += word.length;
      continue;
    }

    out.plain(character);
    at += 1;
  }

  return { segments: out.done(), state: { block } };
}

// Prose, with the parts that are not prose marked: headings, quotes, the bullet
// that starts a list, and anything between backticks.
function tokenizeMarkdown(text, state) {
  if (/^\s*(```|~~~)/.test(text)) {
    return { segments: [{ text, sgr: styleFor('comment') }], state: { fence: !state.fence } };
  }
  if (state.fence) return { segments: [{ text, sgr: styleFor('string') }], state };
  if (/^\s*#{1,6}\s/.test(text)) return { segments: [{ text, sgr: styleFor('heading') }], state };
  if (/^\s*>/.test(text)) return { segments: [{ text, sgr: styleFor('comment') }], state };

  const out = collector();
  let rest = text;
  const bullet = /^(\s*)([-*+]|\d+\.)(\s+)/.exec(rest);
  if (bullet) {
    out.plain(bullet[1]);
    out.styled(bullet[2], 'keyword');
    out.plain(bullet[3]);
    rest = rest.slice(bullet[0].length);
  }
  for (const piece of rest.split(/(`[^`]*`)/)) {
    if (piece === '') continue;
    if (piece.startsWith('`') && piece.endsWith('`') && piece.length > 1) out.styled(piece, 'string');
    else out.plain(piece);
  }
  return { segments: out.done(), state };
}

// A whole file at a time: a block comment or a fenced block opened on one line
// goes on colouring the lines under it, which a line-at-a-time call could not
// know about.
function highlight(lines, language) {
  const rules = LANGUAGES[language];
  if (!rules) return lines.map((text) => [{ text, sgr: '' }]);

  let state = {};
  return lines.map((text) => {
    const painted = rules.markdown ? tokenizeMarkdown(text, state) : tokenizeCode(text, rules, state);
    state = painted.state;
    return painted.segments;
  });
}

module.exports = { languageFor, highlight, LANGUAGES };
