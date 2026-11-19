import { parse } from 'pgsql-ast-parser';

/**
 * Split a SQL script into statements. Understands single-quoted strings,
 * double-quoted identifiers, `--` and block comments, and `$tag$ … $tag$`
 * dollar-quoted bodies, so semicolons inside function bodies do not split.
 * Comment-only fragments are dropped.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; }
          break;
        }
        j++;
      }
      buf += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        buf += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ';') {
      pushStatement(out, buf);
      buf = '';
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  pushStatement(out, buf);
  return out;
}

function pushStatement(out: string[], raw: string) {
  const withoutComments = raw
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  if (withoutComments) out.push(raw.trim());
}

/** Strip leading comment lines so prefix matching sees the keyword. */
export function stripLeadingComments(stmt: string): string {
  return stmt.replace(/^(\s*--[^\n]*\n)+/g, '').trim();
}

export type ParseResult = { sql: string; ok: true } | { sql: string; ok: false; error: string };

/** Parse one statement with pgsql-ast-parser. */
export function tryParse(stmt: string): ParseResult {
  try {
    parse(stmt);
    return { sql: stmt, ok: true };
  } catch (e) {
    return { sql: stmt, ok: false, error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
  }
}
