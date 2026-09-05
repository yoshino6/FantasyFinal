/** 离线读取字面量种子：不连接数据库、不执行 bootstrap。用于逐技能审阅，不能代替线上快照。 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
export const splitSql = (text: string) => {
  const parts: string[] = []; let depth = 0; let quote = false; let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" && text[i - 1] !== '\\') { if (quote && text[i + 1] === "'") { i++; continue; } quote = !quote; }
    if (!quote) { if (c === '(') depth++; else if (c === ')') depth--; else if (c === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; } }
  }
  parts.push(text.slice(start).trim()); return parts;
};
const literal = (text: string): string | number | null => text.startsWith("'") ? text.slice(1, -1).replace(/''/g, "'") : /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text === 'NULL' ? null : text;
export const seedInventory = () => {
  const source = readFileSync('src/database/bootstrap.ts', 'utf8');
  const ast = ts.createSourceFile('bootstrap.ts', source, ts.ScriptTarget.Latest, true);
  const records = new Map<string, Record<string, any>>();
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const sql = node.text;
      const insert = /INSERT(?: IGNORE)? INTO skill_definitions\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?)(?:ON DUPLICATE KEY|$)/i.exec(sql);
      if (insert) for (const tuple of splitSql(insert[2])) {
        if (!tuple.startsWith('(') || !tuple.endsWith(')')) continue;
        const values = splitSql(tuple.slice(1, -1)).map(literal); const cols = splitSql(insert[1]);
        const row = Object.fromEntries(cols.map((c, i) => [c, values[i]]));
        if (typeof row.code === 'string' && /^[a-z0-9_]+$/.test(row.code)) records.set(row.code, { ...records.get(row.code), ...row, sourceLine: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
      }
      // 按源码顺序吸收可确定的 CASE code 数值覆盖；其他复杂迁移仍以实库为准。
      if (/^UPDATE skill_definitions SET/i.test(sql)) for (const match of sql.matchAll(/(\w+)\s*=\s*CASE code([\s\S]*?)END/g)) {
        for (const branch of match[2].matchAll(/WHEN '([^']+)' THEN ('[^']*'|\d+(?:\.\d+)?)/g)) {
          const row = records.get(branch[1]); if (row) row[match[1]] = literal(branch[2]);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); return [...records.values()];
};
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(seedInventory()));
if (process.argv.includes('--effect-calls')) {
  const text = readFileSync('src/game/adventure.service.ts', 'utf8');
  const file = ts.createSourceFile('adventure.ts', text, ts.ScriptTarget.Latest, true);
  const calls: Array<{ text: string; line: number; args: string[] }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'applySkillEffects') {
      const line = file.getLineAndCharacterOfPosition(node.getStart()).line;
      if (line > 3100) calls.push({ text: node.getText(file), line, args: node.arguments.map(arg => arg.getText(file)) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file); process.stdout.write(JSON.stringify(calls));
}
if (process.argv.includes('--skill-status-calls')) {
  const text = readFileSync('src/game/adventure.service.ts', 'utf8');
  const file = ts.createSourceFile('adventure.ts', text, ts.ScriptTarget.Latest, true);
  const calls: Array<{ text: string; line: number; direct: boolean }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'applyAdvancedStatus') {
      let parent: ts.Node | undefined = node.parent; let direct = false;
      while (parent) { if (ts.isIfStatement(parent) && /\bskillCode\b/.test(parent.expression.getText(file))) direct = true; parent = parent.parent; }
      calls.push({ text: node.getText(file), line: file.getLineAndCharacterOfPosition(node.getStart()).line, direct });
    }
    ts.forEachChild(node, visit);
  };
  visit(file); process.stdout.write(JSON.stringify(calls));
}
