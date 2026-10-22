// Maintainer-only command; builds use the checked-in exact versions and lockfile.
import { readFile, writeFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
for (const group of ['dependencies', 'devDependencies']) {
  await Promise.all(Object.keys(pkg[group]).map(async name => {
    const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    pkg[group][name] = (await response.json()).version;
  }));
}
delete pkg.pnpm;
await writeFile('package.json', JSON.stringify(pkg, null, 2) + '\n');
