const fs = require('fs');
const { minifyTemplates, writeFiles } = require('esbuild-minify-templates');

(async () => {
await require('esbuild').build({
  entryPoints: ['acos.js'],
  bundle: true,
  target: 'es2022',
  format: 'esm',
  outfile: 'acos.min.js',
  minify: true,
  write: false,
  plugins: [
    minifyTemplates(),
    writeFiles(),
    ],
})

const code = fs.readFileSync('acos.min.js', 'utf8');
const wrappedCode = `(async function() {${code
    // dont question this regex, it works as long as the built code doesn't add any newlines in the middle of the code
    .replace(/\n/g, ' ')
}})();`;
fs.writeFileSync('acos.min.js', wrappedCode, 'utf8');

})();