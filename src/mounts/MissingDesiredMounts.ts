import {
  noPluginConfiguration,
  unconfiguredPluginRemedy,
} from "./PluginConfiguration";

export function missingDesiredMounts() {
  return { ...missingReads(), ...missingMutations() };
}

function missingReads() {
  return {
    desiredStatus: () =>
      Promise.resolve({
        configured: false,
        remedy: unconfiguredPluginRemedy(),
      }),
    desiredPlan: () => Promise.resolve([]),
  };
}

function missingMutations() {
  const missing = () => Promise.reject(new Error(noPluginConfiguration()));
  return { applyDesired: missing, refreshDesired: missing };
}
