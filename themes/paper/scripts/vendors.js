'use strict';

const fs = require('fs');
const path = require('path');

// Ship the pinned upstream distributions and licenses; no runtime CDN dependency.
hexo.extend.generator.register('paper-vendors', () => {
  const assets = [
    ['a11y-dialog', require.resolve('a11y-dialog/dist/a11y-dialog.min.js'), 'a11y-dialog.min.js'],
    ['clipboard', require.resolve('clipboard/dist/clipboard.min.js'), 'clipboard.min.js'],
    ['fuse.js', path.join(path.dirname(require.resolve('fuse.js/min')), 'fuse.min.mjs'), 'fuse.min.mjs']
  ];
  return assets.flatMap(([name, file, output]) => [
    {path: `lib/paper/${output}`, data: () => fs.createReadStream(file)},
    {path: `lib/paper/${name}.LICENSE.txt`, data: () => fs.createReadStream(path.join(path.dirname(file), '../LICENSE'))}
  ]);
});
