import path from 'node:path';
import ts from 'typescript';

import { CheckFailure } from '../errors.js';
import { escapeControlCharacters } from '../text.js';
import type { AccessMechanism, AppName, EnvReference } from '../types.js';

// The TypeScript API keeps parse diagnostics off its public SourceFile type,
// although the property has been stable for many releases. A CLI test with a
// syntax error guards this when the compiler is upgraded.
interface ParsedSourceFile extends ts.SourceFile {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
}

const MECHANISM_BY_APP: Record<AppName, AccessMechanism> = {
  client: 'import.meta.env',
  server: 'process.env',
};

/**
 * Finds direct env accesses in one file: `import.meta.env.NAME` for the client
 * and `process.env.NAME` for the server, plus bracket access with a literal key.
 * Only syntax is examined; aliases, destructuring, and computed keys are skipped.
 */
export function findEnvReferences(sourceText: string, relativePath: string, app: AppName): EnvReference[] {
  const text = sourceText.startsWith('\uFEFF') ? sourceText.slice(1) : sourceText;
  const sourceFile = ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.Latest,
    false,
    scriptKindFor(relativePath),
  ) as ParsedSourceFile;

  const firstError = sourceFile.parseDiagnostics?.[0];
  if (firstError !== undefined) {
    const position = sourceFile.getLineAndCharacterOfPosition(firstError.start);
    throw new CheckFailure(
      `Could not parse ${escapeControlCharacters(relativePath)}:${position.line + 1}:${position.character + 1} ` +
        `(syntax error TS${firstError.code}). Fix the syntax error and run the check again.`,
    );
  }

  const mechanism = MECHANISM_BY_APP[app];
  const references: EnvReference[] = [];

  const visit = (node: ts.Node): void => {
    const name = envNameAccessedBy(node, mechanism);
    if (name !== undefined) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      references.push({
        app,
        mechanism,
        name,
        file: relativePath,
        line: position.line + 1,
        column: position.character + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return references;
}

function envNameAccessedBy(node: ts.Node, mechanism: AccessMechanism): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    if (ts.isIdentifier(node.name) && isEnvObject(node.expression, mechanism)) {
      return node.name.text;
    }
    return undefined;
  }
  if (ts.isElementAccessExpression(node)) {
    const key = node.argumentExpression;
    if (ts.isStringLiteralLike(key) && isEnvObject(node.expression, mechanism)) {
      return key.text;
    }
  }
  return undefined;
}

function isEnvObject(node: ts.Expression, mechanism: AccessMechanism): boolean {
  if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.name) || node.name.text !== 'env') {
    return false;
  }
  const owner = node.expression;
  if (mechanism === 'process.env') {
    return ts.isIdentifier(owner) && owner.text === 'process';
  }
  return ts.isMetaProperty(owner) && owner.keywordToken === ts.SyntaxKind.ImportKeyword && owner.name.text === 'meta';
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  switch (path.extname(fileName)) {
    case '.ts':
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS;
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.JS;
  }
}
