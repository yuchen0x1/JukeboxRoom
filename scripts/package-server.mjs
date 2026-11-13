import fs from 'node:fs';
import path from 'node:path';

// Only source and package metadata belong in a portable server bundle.
// Credentials, JSON stores and recovery copies must stay on the source machine.
export function isServerPackageEntry(relativePath, isDirectory) {
  const parts = relativePath.split(/[\\/]/);
  if (parts.some((part) => /^(?:data[^/]*|downloads|node_modules|tests?)$/i.test(part))) return false;
  if (parts.some((part) => part.startsWith('.'))) return relativePath === '.env.example' && !isDirectory;
  if (isDirectory) return true;
  const name = parts.at(-1);
  return (parts.length === 1 && ['package.json', 'package-lock.json'].includes(name))
    || (name.endsWith('.js') && !/\.(?:test|spec)\.js$/.test(name));
}

export function copyServerFiles(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    filter(entry) {
      const stat = fs.lstatSync(entry);
      if (stat.isSymbolicLink()) return false;
      const relativePath = path.relative(source, entry);
      return !relativePath || isServerPackageEntry(relativePath, stat.isDirectory());
    },
  });
}
