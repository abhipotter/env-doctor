import { escapeControlCharacters, pluralize } from '../text.js';
import type { AppSummary, CheckResult, Finding, Severity, SourceLocation } from '../types.js';

const SEVERITY_LABELS: Record<Severity, string> = {
  error: 'ERROR',
  warning: 'WARN ',
  info: 'INFO ',
};

const INDENT = '  ';
const WRAP_WIDTH = 78;
const ADDITIONAL_LOCATIONS_SHOWN = 2;

export function formatReport(result: CheckResult): string {
  const lines: string[] = [];

  for (const finding of result.findings) {
    lines.push(...formatFinding(finding), '');
  }

  lines.push(...formatScanSummary(result.apps));
  lines.push(formatFindingCounts(result.findings));

  return `${lines.join('\n')}\n`;
}

function formatFinding(finding: Finding): string[] {
  const subject = finding.variable ?? finding.file ?? '';
  let header = `${SEVERITY_LABELS[finding.severity]} [${finding.ruleId}] ${escapeControlCharacters(subject)}`;
  if (finding.location !== undefined) {
    header += `  ${formatLocation(finding.location)}`;
  }

  const lines = [header];
  if (finding.additionalLocations.length > 0) {
    lines.push(...wrapText(describeAdditionalLocations(finding.additionalLocations)));
  }
  lines.push(...wrapText(escapeControlCharacters(finding.action)));
  return lines;
}

function describeAdditionalLocations(locations: SourceLocation[]): string {
  const shown = locations.slice(0, ADDITIONAL_LOCATIONS_SHOWN).map(formatLocation);
  const remaining = locations.length - shown.length;

  if (remaining > 0) {
    return `Also referenced at ${shown.join(', ')}, and ${remaining} more.`;
  }
  if (shown.length === 2) {
    return `Also referenced at ${shown[0]} and ${shown[1]}.`;
  }
  return `Also referenced at ${shown[0]}.`;
}

function formatLocation(location: SourceLocation): string {
  return `${escapeControlCharacters(location.file)}:${location.line}:${location.column}`;
}

function formatScanSummary(apps: AppSummary[]): string[] {
  const filesScanned = apps.reduce((total, app) => total + app.filesScanned, 0);
  const referencesChecked = apps.reduce((total, app) => total + app.referencesChecked, 0);
  const lines: string[] = [];

  if (referencesChecked === 0) {
    lines.push(
      `No supported environment variable references were detected in ${pluralize(filesScanned, 'scanned file')}.`,
    );
  } else {
    const appDescriptions = apps.map(
      (app) =>
        `${escapeControlCharacters(app.directory)} (${pluralize(app.filesScanned, 'file')}, ` +
        `${pluralize(app.referencesChecked, 'reference')})`,
    );
    lines.push(`Scanned ${appDescriptions.join(' and ')}.`);
  }

  for (const app of apps) {
    if (app.referencesIgnored > 0) {
      lines.push(
        `Skipped ${pluralize(app.referencesIgnored, `${app.app} reference`)} without the VITE_ prefix ` +
          '(custom envPrefix settings are not supported).',
      );
    }
  }

  return lines;
}

function formatFindingCounts(findings: Finding[]): string {
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const infos = findings.filter((finding) => finding.severity === 'info').length;
  return [
    pluralize(errors, 'error'),
    pluralize(warnings, 'warning'),
    pluralize(infos, 'informational finding'),
  ].join(', ');
}

function wrapText(text: string): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of text.split(' ')) {
    if (current === '') {
      current = word;
    } else if (INDENT.length + current.length + 1 + word.length <= WRAP_WIDTH) {
      current += ` ${word}`;
    } else {
      lines.push(INDENT + current);
      current = word;
    }
  }
  if (current !== '') {
    lines.push(INDENT + current);
  }
  return lines;
}
