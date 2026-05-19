import fs from 'fs';

const htmlPath = 'src/app/pages/comandas/comandas.component.html';
const scssPath = 'src/app/pages/comandas/comandas.component.scss';

const htmlLines = fs.readFileSync(htmlPath, 'utf8').split(/\r?\n/);
const htmlOut = [
  ...htmlLines.slice(0, 830),
  ...htmlLines.slice(1483),
].join('\n');
fs.writeFileSync(htmlPath, htmlOut.endsWith('\n') ? htmlOut : htmlOut + '\n');

const scssLines = fs.readFileSync(scssPath, 'utf8').split(/\r?\n/);
const removeRanges = [
  [1116, 1119],
  [1136, 1142],
  [1289, 2834],
];
const remove = new Set();
for (const [a, b] of removeRanges) {
  for (let i = a; i <= b; i++) remove.add(i);
}
const scssOut = scssLines
  .filter((_, i) => !remove.has(i))
  .join('\n');
fs.writeFileSync(scssPath, scssOut.endsWith('\n') ? scssOut : scssOut + '\n');
console.log('stripped html and scss');
