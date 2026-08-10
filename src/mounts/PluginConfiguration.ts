export function unconfiguredPluginRemedy() {
  return "Restart yafsd with --config PATH or set YAFS_CONFIG, then run plugins apply.";
}

export function noPluginConfiguration() {
  return `No daemon plugin configuration. ${unconfiguredPluginRemedy()}`;
}
