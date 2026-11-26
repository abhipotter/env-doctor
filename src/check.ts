import { discoverSourceFiles, readSourceFile, resolveProjectLayout, type AppDirectory } from './project/discover.js';
import { findBuildTimeGuidance, findRuntimeGuidance } from './rules/deployment.js';
import { findMissingVariables } from './rules/missing-variable.js';
import { findPublicSecretNames } from './rules/public-secret.js';
import { readEnvExample } from './scan/env-example.js';
import { findEnvReferences } from './scan/source.js';
import { compareText } from './text.js';
import type {
  AppSummary,
  CheckResult,
  EnvExample,
  EnvReference,
  Finding,
  Severity,
  SourceLocation,
  VariableUsage,
} from './types.js';

export interface CheckOptions {
  cwd: string;
  client?: string;
  server?: string;
}

const VITE_PREFIX = 'VITE_';
const VITE_BUILT_INS = new Set(['MODE', 'BASE_URL', 'PROD', 'DEV', 'SSR']);

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

interface ScannedApp {
  usages: VariableUsage[];
  example: EnvExample;
  summary: AppSummary;
}

export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const layout = await resolveProjectLayout(options);
  const client = await scanApp(layout.rootDirectory, layout.client);
  const server = await scanApp(layout.rootDirectory, layout.server);

  const findings = [
    ...findMissingVariables(client.usages, client.example),
    ...findPublicSecretNames(client.usages),
    ...findBuildTimeGuidance(client.usages),
    ...findMissingVariables(server.usages, server.example),
    ...findRuntimeGuidance(server.usages),
  ];

  return {
    findings: sortFindings(findings),
    apps: [client.summary, server.summary],
  };
}

async function scanApp(rootDirectory: string, appDirectory: AppDirectory): Promise<ScannedApp> {
  const files = await discoverSourceFiles(rootDirectory, appDirectory);

  const checkedReferences: EnvReference[] = [];
  let ignoredCount = 0;
  for (const file of files) {
    const sourceText = await readSourceFile(file);
    for (const reference of findEnvReferences(sourceText, file.relativePath, appDirectory.app)) {
      if (isCheckedReference(reference)) {
        checkedReferences.push(reference);
      } else if (!VITE_BUILT_INS.has(reference.name)) {
        ignoredCount++;
      }
    }
  }

  const example = await readEnvExample(rootDirectory, appDirectory);

  return {
    usages: groupUsages(checkedReferences),
    example,
    summary: {
      app: appDirectory.app,
      directory: appDirectory.relativePath,
      filesScanned: files.length,
      referencesChecked: checkedReferences.length,
      referencesIgnored: ignoredCount,
      exampleFound: example.present,
    },
  };
}

// The client rules cover the default Vite prefix only. Vite built-ins such as
// MODE are never declared in an example file.
function isCheckedReference(reference: EnvReference): boolean {
  if (reference.app === 'server') {
    return true;
  }
  return reference.name.startsWith(VITE_PREFIX);
}

/** Collects the references to each variable, ordered by name, with locations in file order. */
export function groupUsages(references: EnvReference[]): VariableUsage[] {
  const usagesByName = new Map<string, VariableUsage>();
  for (const reference of references) {
    let usage = usagesByName.get(reference.name);
    if (usage === undefined) {
      usage = { app: reference.app, name: reference.name, locations: [] };
      usagesByName.set(reference.name, usage);
    }
    usage.locations.push({ file: reference.file, line: reference.line, column: reference.column });
  }

  const usages = [...usagesByName.values()];
  for (const usage of usages) {
    usage.locations.sort(compareLocations);
  }
  usages.sort((left, right) => compareText(left.name, right.name));
  return usages;
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(compareFindings);
}

function compareFindings(left: Finding, right: Finding): number {
  return (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    compareText(left.app, right.app) ||
    compareText(left.variable ?? '', right.variable ?? '') ||
    compareText(left.ruleId, right.ruleId) ||
    compareOptionalLocations(left.location, right.location)
  );
}

function compareOptionalLocations(left: SourceLocation | undefined, right: SourceLocation | undefined): number {
  if (left === undefined || right === undefined) {
    return Number(left !== undefined) - Number(right !== undefined);
  }
  return compareLocations(left, right);
}

function compareLocations(left: SourceLocation, right: SourceLocation): number {
  return compareText(left.file, right.file) || left.line - right.line || left.column - right.column;
}
