'use strict';

const { stripHTML, unescapeHTML, slugize, escapeHTML } = require('hexo-util');

hexo.extend.helper.register('paper_content', function(post) {
  let html = post.content || '';
  // The page title is H1; preserve source heading IDs when shifting body levels.
  if (/<h1[\s>]/i.test(html)) {
    const used = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    html = html.replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/gi, (heading, attrs, text) => {
      if (/\bid\s*=/.test(attrs)) return heading;
      const base = slugize(unescapeHTML(stripHTML(text))) || 'section';
      let id = base;
      let suffix = 1;
      while (used.has(escapeHTML(id))) id = `${base}-paper-${suffix++}`;
      used.add(escapeHTML(id));
      return `<h1${attrs} id="${escapeHTML(id)}">${text}</h1>`;
    });
    html = html.replace(/<(\/?)(h)([1-6])(?=[\s>])/gi,
      (_, close, h, level) => `<${close}h${Math.min(Number(level) + 1, 6)}`);
  }
  return html;
});

const paper = require('../lib/content');
hexo.extend.helper.register('paper_summary', paper.summary);
hexo.extend.helper.register('paper_has_date', post => paper.explicit(post, 'date'));
hexo.extend.helper.register('paper_card_path', paper.cardPath);
hexo.extend.helper.register('paper_has_updated', post => paper.explicit(post, 'updated'));
hexo.extend.helper.register('paper_kind', post => post.kind === 'article' ? '文章' : '学习笔记');
hexo.extend.helper.register('paper_featured', function() {
  return this.site.posts.toArray().filter(p => p.featured && p.published !== false).sort((a,b) => a.featured-b.featured).slice(0,3);
});
hexo.extend.helper.register('paper_related', function(post) {
  const tags = new Set(post.tags.map(t => t.name));
  const categories = new Set(post.categories.map(t => t.name));
  return this.site.posts.toArray().filter(p => p.path !== post.path && p.published !== false).map(p => {
    const curated = (post.related || []).indexOf(p.path.replace(/index\.html$/, ''));
    return {post:p, score:curated >= 0 ? 100-curated : p.tags.reduce((n,t)=>n+(tags.has(t.name)?3:0),0)+p.categories.reduce((n,t)=>n+(categories.has(t.name)?1:0),0)};
  }).filter(p => p.score > 0).sort((a,b)=>b.score-a.score || a.post.path.localeCompare(b.post.path)).slice(0,2).map(p=>p.post);
});
