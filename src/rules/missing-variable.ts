import type { EnvExample, Finding, VariableUsage } from '../types.js';

const TEMPLATE_NAMES_SHOWN = 5;

/**
 * Compares one app's referenced variables with its example file. A missing
 * example produces a single template error instead of one error per key.
 */
export function findMissingVariables(usages: VariableUsage[], example: EnvExample): Finding[] {
  if (usages.length === 0) {
    return [];
  }

  if (!example.present) {
    return [
      {
        ruleId: 'missing-template',
        severity: 'error',
        app: example.app,
        file: example.path,
        additionalLocations: [],
        action: describeMissingTemplate(usages, example.path),
      },
    ];
  }

  const findings: Finding[] = [];
  for (const usage of usages) {
    if (example.keys.has(usage.name)) {
      continue;
    }
    findings.push({
      ruleId: 'missing-declaration',
      severity: 'error',
      app: usage.app,
      variable: usage.name,
      location: usage.locations[0],
      additionalLocations: usage.locations.slice(1),
      action: `Add ${usage.name}= to ${example.path} and configure the value separately.`,
    });
  }
  return findings;
}

function describeMissingTemplate(usages: VariableUsage[], examplePath: string): string {
  const shownNames = usages.slice(0, TEMPLATE_NAMES_SHOWN).map((usage) => `${usage.name}=`);
  const hiddenCount = usages.length - shownNames.length;

  let nameList = shownNames.join(', ');
  if (hiddenCount > 0) {
    nameList += `, and ${hiddenCount} more`;
  }

  const variableWord = usages.length === 1 ? 'variable' : 'variables';
  return (
    `Create ${examplePath} and declare the ${usages.length} ${variableWord} this app reads: ${nameList}. ` +
    'Configure the values separately.'
  );
}
