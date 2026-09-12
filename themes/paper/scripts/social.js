'use strict';
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { escapeHTML } = require('hexo-util');
const { summary, cardPath } = require('../lib/content');

// Stable typographic template, rendered at build time. No client font download.
function lines(text, units) {
  const result = []; let line = '', width = 0;
  for (const char of Array.from(text)) {
    const size = /[\x00-\x7f]/.test(char) ? .58 : 1;
    if (width + size > units && line && !/[，。！？；：、）》」』]/.test(char)) { result.push(line); line = ''; width = 0; }
    line += char; width += size;
  }
  if (line) result.push(line);
  return result;
}
hexo.extend.generator.register('paper-social', function(locals) {
  const font = path.join(hexo.theme_dir, 'assets/fonts/NotoSerifCJKsc-Regular.otf');
  const cache = path.join(hexo.base_dir, '.cache/paper-share');
  fs.mkdirSync(cache, {recursive: true});
  const posts = locals.posts.toArray().filter(post => post.published !== false);
  const home = {path: '', title: hexo.config.title, description: hexo.config.description};
  return [...posts, home].map(post => {
    const output = cardPath(post);
    const file = path.join(cache, path.basename(output));
    if (!fs.existsSync(file)) {
      const title = String(post.title || '无题');
      const size = title.length > 52 ? 44 : 58;
      const titleLines = lines(title, 1030 / size);
      if (titleLines.length > 4) throw new Error(`分享标题过长，请缩短：${title}`);
      const text = (items, y, fontSize, color, step) => items.map((line, i) => `<text x="80" y="${y + i * step}" font-size="${fontSize}" fill="${color}">${escapeHTML(line)}</text>`).join('');
      const descriptionY = Math.max(365, 200 + titleLines.length * 72);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" font-family="Noto Serif CJK SC"><rect width="1200" height="630" fill="#f7f5ef"/><path d="M80 102H1120M80 530H1120" stroke="#dcd7cd"/><rect x="80" y="66" width="28" height="3" fill="#964d3b"/><text x="122" y="77" font-size="22" fill="#68645e">${escapeHTML(hexo.config.author)} · 编程与实践</text>${text(titleLines, 205, size, '#292824', 72)}${text(lines(summary(post), 43).slice(0, 2), descriptionY, 24, '#68645e', 38)}<text x="80" y="579" font-size="23" fill="#964d3b">${escapeHTML(new URL(hexo.config.url).hostname)}</text><text x="1120" y="579" text-anchor="end" font-size="20" fill="#68645e">${post.path ? '文章与笔记' : 'Hungry &amp; Humble'}</text></svg>`;
      fs.writeFileSync(file, new Resvg(svg, {font: {fontFiles: [font], loadSystemFonts: false}}).render().asPng());
    }
    return {path: output, data: () => fs.createReadStream(file)};
  });
});
