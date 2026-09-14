'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const fm = require('hexo-front-matter');
const {unescapeHTML} = require('hexo-util');
const root = path.resolve(__dirname, '..');
function walk(dir) { return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
const posts = walk(path.join(root, 'source/_posts')).filter(p => p.endsWith('.md')).map(p => ({file: p, ...fm.parse(fs.readFileSync(p, 'utf8'))})).filter(p => p.published !== false);
for (const post of posts) {
  assert(post.title && post._content.trim(), `文章缺少标题或正文：${post.file}`);
  assert(post.description && post.intro, `请补齐摘要和导读：${post.file}`);
  assert(['article', 'note'].includes(post.kind), `请声明 kind：${post.file}`);
  if (post.featured) assert(post.permalink, `精选文章需锁定永久链接：${post.file}`);
  if (post.diagram) assert(post.diagram_alt && post.diagram_caption, `配图缺少说明：${post.file}`);
}
const meta = (html, key) => unescapeHTML(html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1] || '');
// Research downloads are original artifacts, not themed website pages.
const downloadRoot = path.join(root, 'source/downloads/agent-harness');
if (fs.existsSync(downloadRoot)) {
  for (const source of walk(downloadRoot)) {
    const output = path.join(root, 'public/downloads/agent-harness', path.relative(downloadRoot, source));
    assert(fs.existsSync(output) && fs.readFileSync(source).equals(fs.readFileSync(output)), `原始附件被修改或丢失：${source}`);
  }
}
const downloadPrefix = path.join(root, 'public/downloads/agent-harness') + path.sep;
const htmlFiles = walk(path.join(root, 'public')).filter(p => p.endsWith('.html') && !p.startsWith(downloadPrefix));
const articles = [];
const articlePaths = new Set();
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:card']) assert(meta(html, key), `${file}: 缺少 ${key}`);
  assert.equal(meta(html, 'og:title'), meta(html, 'twitter:title'));
  assert.equal(meta(html, 'og:description'), meta(html, 'twitter:description'));
  assert.equal(meta(html, 'og:image'), meta(html, 'twitter:image'));
  const url = new URL(meta(html, 'og:image'));
  assert.equal(url.origin, 'https://aresning.github.io');
  const png = fs.readFileSync(path.join(root, 'public', url.pathname));
  assert.equal(png.subarray(1,4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  assert(png.length < 600000, `封面过大：${file}`);
  if (meta(html, 'og:type') === 'article') {
    articles.push(file);
    const articleUrl = new URL(meta(html, 'og:url'));
    assert.equal(articleUrl.origin, 'https://aresning.github.io');
    const articlePath = articleUrl.pathname.replace(/index\.html$/, '').replace(/^\//, '');
    assert(!articlePaths.has(articlePath), `重复的文章地址：${articlePath}`);
    articlePaths.add(articlePath);
    const title = unescapeHTML(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || '');
    assert.equal(title, meta(html, 'og:title'));
    const source = posts.find(p => p.title === title); assert(source, `文章无对应来源：${title}`);
    assert.equal(Boolean(meta(html, 'article:published_time')), Boolean(source.date), `发布日期不得来自文件时间：${title}`);
    assert.equal(Boolean(meta(html, 'article:modified_time')), Boolean(source.updated));
    assert(html.includes('class="author-note"') && html.includes('class="share-section"'));
    if (source.diagram) {
      assert(source.diagram.endsWith('.svg'), `配图需要 SVG 格式：${title}`);
      for (const asset of [source.diagram, source.diagram.replace(/\.svg$/, '-mobile.svg')]) {
        assert(fs.existsSync(path.join(root, 'public', asset)), `缺少配图版本：${asset}`);
        assert(html.includes(asset), `页面未引用配图版本：${asset}`);
      }
    }
    if (source.permalink) assert.equal(new URL(meta(html, 'og:url')).pathname.replace(/index.html$/, ''), '/' + source.permalink);
  }
}
assert.equal(articles.length, posts.length);
for (const post of posts) {
  for (const related of post.related || []) {
    assert(articlePaths.has(related), `相关阅读地址不存在或未公开：${post.title} → ${related}`);
    assert(related !== post.permalink, `相关阅读不能指向自己：${post.title}`);
  }
}
const home = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
assert.equal(posts.filter(p => p.featured).length, 3);
assert.deepEqual(posts.filter(p => p.featured).map(p => p.featured).sort(), [1, 2, 3], '精选序号必须分别为 1、2、3');
assert(home.includes('从这三篇开始'));
assert(!home.includes('test-blog') && !home.includes('无题'));
const search = fs.readFileSync(path.join(root, 'public/search.xml'), 'utf8');
assert(!search.includes('test-blog') && !search.includes('objects-and-data-structures'));
const searchPaths = [...search.matchAll(/<url>([^<]+)<\/url>/g)].map(match => {
  const url = new URL(unescapeHTML(match[1]).replace(/^\/+/, '/'), 'https://aresning.github.io');
  const articlePath = decodeURI(url.pathname).replace(/^\//, '').replace(/index\.html$/, '');
  assert(articlePaths.has(articlePath), `搜索结果不是公开文章：${match[1]}`);
  return articlePath;
});
assert.deepEqual(new Set(searchPaths), articlePaths, '搜索索引必须覆盖全部公开文章路径');
console.log(`通过：${posts.length} 篇公开文章、${htmlFiles.length} 个页面的分享信息、封面、日期来源、精选和草稿隔离。`);
