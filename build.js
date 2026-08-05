const { minifyTemplates, writeFiles } = require('esbuild-minify-templates');
require('esbuild').build({
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

