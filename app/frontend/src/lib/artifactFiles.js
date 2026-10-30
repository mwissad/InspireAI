const HIDDEN_EXTENSIONS = ['.json', '.jsonl'];

export function visibleArtifactFiles(files) {
  return (Array.isArray(files) ? files : []).filter((file) => {
    if (!file || file.is_directory) return Boolean(file);
    const name = String(file.name || file.path || '').toLowerCase();
    return !HIDDEN_EXTENSIONS.some((ext) => name.endsWith(ext));
  });
}

const QUICK_ACCESS_EXTENSIONS = ['pdf', 'csv', 'xlsx', 'xls'];
const EXCEL_EXTENSIONS = ['xlsx', 'xls'];

export function fileExtension(file) {
  const name = String(file?.name || '').toLowerCase();
  return name.includes('.') ? name.split('.').pop() : '';
}

export function quickAccessFiles(files) {
  const shown = (Array.isArray(files) ? files : [])
    .filter((file) => file && !file.is_directory && QUICK_ACCESS_EXTENSIONS.includes(fileExtension(file)));
  if (!shown.some((file) => EXCEL_EXTENSIONS.includes(fileExtension(file)))) return shown;
  return shown.filter((file) => fileExtension(file) !== 'csv');
}
