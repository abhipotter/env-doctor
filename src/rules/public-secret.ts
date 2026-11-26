import type { Finding, VariableUsage } from '../types.js';

// Underscore-delimited tokens or token sequences that usually name a private
// credential. A lone TOKEN or KEY is left out because public map and analytics
// keys commonly use those words.
const SECRET_TOKEN_SEQUENCES: string[][] = [
  ['SECRET'],
  ['SECRETS'],
  ['PASSWORD'],
  ['PASSWD'],
  ['CREDENTIAL'],
  ['CREDENTIALS'],
  ['PRIVATE', 'KEY'],
  ['ACCESS', 'TOKEN'],
  ['REFRESH', 'TOKEN'],
  ['AUTH', 'TOKEN'],
  ['API', 'KEY'],
  ['APIKEY'],
];

export function looksLikeSecretName(name: string): boolean {
  const tokens = name
    .toUpperCase()
    .split('_')
    .filter((token) => token.length > 0);
  return SECRET_TOKEN_SEQUENCES.some((sequence) => containsSequence(tokens, sequence));
}

function containsSequence(tokens: string[], sequence: string[]): boolean {
  for (let start = 0; start + sequence.length <= tokens.length; start++) {
    const matches = sequence.every((token, offset) => tokens[start + offset] === token);
    if (matches) {
      return true;
    }
  }
  return false;
}

/** Flags Vite browser variables whose names suggest a credential. The match is name-based only. */
export function findPublicSecretNames(clientUsages: VariableUsage[]): Finding[] {
  const findings: Finding[] = [];
  for (const usage of clientUsages) {
    if (!looksLikeSecretName(usage.name)) {
      continue;
    }
    findings.push({
      ruleId: 'public-secret-name',
      severity: 'warning',
      app: usage.app,
      variable: usage.name,
      location: usage.locations[0],
      additionalLocations: usage.locations.slice(1),
      action:
        'The name suggests a secret, and Vite embeds VITE_ values in browser code. ' +
        'If this is a private credential, keep it on the server and remove the browser reference. ' +
        'If a real secret already shipped, rotate it. Publishable keys can stay.',
    });
  }
  return findings;
}
