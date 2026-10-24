const HIDDEN_EXTENSIONS = ['.json', '.jsonl'];

export function visibleArtifactFiles(files) {
  return (Array.isArray(files) ? files : []).filter((file) => {
    if (!file || file.is_directory) return Boolean(file);
    const name = String(file.name || file.path || '').toLowerCase();
    return !HIDDEN_EXTENSIONS.some((ext) => name.endsWith(ext));
  });
}
