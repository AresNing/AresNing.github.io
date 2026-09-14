'use strict';
const { stripHTML, unescapeHTML } = require('hexo-util');
const { createHash } = require('crypto');
function plain(html) {
  return unescapeHTML(stripHTML(String(html || '').replace(/<\/(?:p|h[1-6]|li|blockquote)>/gi, ' '))).replace(/\s+/g, ' ').trim();
}
function summary(post) {
  const value = plain(post.description || post.excerpt || post.content);
  return value.length > 140 ? value.slice(0, 140) + '…' : value;
}
function explicit(post, field) {
  const header = (post.raw || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  return Boolean(header && new RegExp(`^${field}:[ \\t]*[^\\s#]`, 'm').test(header[1]));
}
function cardPath(post) {
  const key = JSON.stringify([post.path, post.title, summary(post), post.card_title_lines ? ['paper-card-v4-lines', post.card_title_lines] : post.card_wrap === 'words' ? 'paper-card-v3-words' : 'paper-card-v2']);
  return `images/share/${createHash('sha256').update(key).digest('hex').slice(0, 16)}.png`;
}
module.exports = { plain, summary, explicit, cardPath };
