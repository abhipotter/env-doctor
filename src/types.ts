export type AppName = 'client' | 'server';

export type AccessMechanism = 'import.meta.env' | 'process.env';

export type Severity = 'error' | 'warning' | 'info';

export type RuleId =
  | 'missing-template'
  | 'missing-declaration'
  | 'public-secret-name'
  | 'vite-build-time'
  | 'node-runtime';

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface EnvReference {
  app: AppName;
  mechanism: AccessMechanism;
  name: string;
  file: string;
  line: number;
  column: number;
}

export interface EnvExample {
  app: AppName;
  path: string;
  present: boolean;
  keys: Set<string>;
}

/** Every reference to one variable within one app, with locations in report order. */
export interface VariableUsage {
  app: AppName;
  name: string;
  locations: SourceLocation[];
}

export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  app: AppName;
  variable?: string;
  file?: string;
  location?: SourceLocation;
  additionalLocations: SourceLocation[];
  action: string;
}

export interface AppSummary {
  app: AppName;
  directory: string;
  filesScanned: number;
  referencesChecked: number;
  referencesIgnored: number;
  exampleFound: boolean;
}

export interface CheckResult {
  findings: Finding[];
  apps: AppSummary[];
}
