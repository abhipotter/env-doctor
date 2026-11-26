import type { Finding, VariableUsage } from '../types.js';

/** Vite replaces import.meta.env.VITE_* during the build, so a new value needs a new build. */
export function findBuildTimeGuidance(clientUsages: VariableUsage[]): Finding[] {
  return clientUsages.map((usage): Finding => ({
    ruleId: 'vite-build-time',
    severity: 'info',
    app: usage.app,
    variable: usage.name,
    location: usage.locations[0],
    additionalLocations: usage.locations.slice(1),
    action: 'Supply the updated value when building, then redeploy the frontend assets.',
  }));
}

/** Node reads process.env from the running process, so a new value needs a new process. */
export function findRuntimeGuidance(serverUsages: VariableUsage[]): Finding[] {
  return serverUsages.map((usage): Finding => ({
    ruleId: 'node-runtime',
    severity: 'info',
    app: usage.app,
    variable: usage.name,
    location: usage.locations[0],
    additionalLocations: usage.locations.slice(1),
    action: 'If injected at startup, start a new server process with the updated value.',
  }));
}
