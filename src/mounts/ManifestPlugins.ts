export function declarationsFor(root: Record<string, unknown>) {
  if (root.plugins !== undefined && root.mounts !== undefined) {
    throw new Error("Use plugins, not both plugins and mounts");
  }
  return root.plugins === undefined ? root.mounts : root.plugins;
}

export function pluginName(record: Record<string, unknown>) {
  if (record.plugin !== undefined && record.provider !== undefined) {
    throw new Error("Use plugin, not both plugin and provider");
  }
  return record.plugin === undefined ? record.provider : record.plugin;
}
