'use strict';

const fs = require('fs');
const path = require('path');

// Ship the pinned upstream distributions and licenses; no runtime CDN dependency.
hexo.extend.generator.register('paper-vendors', () => {
  const assets = [
    ['a11y-dialog', require.resolve('a11y-dialog/dist/a11y-dialog.min.js'), 'a11y-dialog.min.js'],
    ['clipboard', require.resolve('clipboard/dist/clipboard.min.js'), 'clipboard.min.js'],
    ['fuse.js', path.join(path.dirname(require.resolve('fuse.js/min')), 'fuse.min.mjs'), 'fuse.min.mjs'],
    ['floating-ui-core', path.join(path.dirname(require.resolve('@floating-ui/core')), 'floating-ui.core.umd.min.js'), 'floating-ui.core.min.js'],
    ['floating-ui-dom', path.join(path.dirname(require.resolve('@floating-ui/dom')), 'floating-ui.dom.umd.min.js'), 'floating-ui.dom.min.js']
  ];
  return assets.flatMap(([name, file, output]) => [
    {path: `lib/paper/${output}`, data: () => fs.createReadStream(file)},
    {path: `lib/paper/${name}.LICENSE.txt`, data: () => fs.createReadStream(path.join(path.dirname(file), '../LICENSE'))}
  ]);
});
