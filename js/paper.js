'use strict';

(() => {
  // a11y-dialog owns opening, overlay/Esc dismissal, focus trapping and restoration.
  const menuDialog = new A11yDialog(document.querySelector('#menu-dialog'));
  const dialog = document.querySelector('#search-dialog');
  const searchDialog = new A11yDialog(dialog);
  document.querySelectorAll('[data-a11y-dialog-show]').forEach(button => { button.hidden = false; });
  document.documentElement.classList.add('js-ready');
  matchMedia('(min-width: 768px)').addEventListener('change', event => {
    if (event.matches && menuDialog.shown) {
      menuDialog.hide();
      // The mobile opener disappears at this breakpoint; return to its desktop equivalent.
      document.querySelector('.desktop-nav a[aria-current], .desktop-nav a').focus();
    }
  });

  const input = dialog.querySelector('input');
  const results = dialog.querySelector('.search-results');
  const status = dialog.querySelector('.search-status');
  let indexPromise;
  let requestVersion = 0;
  let searchTimer;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(dialog.dataset.searchUrl).then(response => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.text();
      }).then(async xml => {
        const {default: Fuse} = await import(dialog.dataset.fuseUrl);
        const data = new DOMParser().parseFromString(xml, 'application/xml');
        if (data.querySelector('parsererror')) throw new Error('Invalid search index');
        const posts = [...data.querySelectorAll('entry')].map(entry => {
          const title = entry.querySelector('title')?.textContent || '无题';
          const rawUrl = entry.querySelector('url')?.textContent || entry.querySelector('link')?.getAttribute('href');
          const url = new URL(rawUrl, location.origin);
          if (!['http:', 'https:'].includes(url.protocol)) return null;
          // The XML uses production absolute URLs. Internal results also work in local preview.
          const href = url.pathname + url.search + url.hash;
          const template = document.createElement('template');
          template.innerHTML = entry.querySelector('content')?.textContent || '';
          template.content.querySelectorAll('script, style, .gutter, .line-numbers-rows').forEach(node => node.remove());
          template.content.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, pre, td').forEach(node => node.append(' '));
          const content = (template.content.textContent || '').replace(/\s+/g, ' ').trim();
          const tags = [...entry.querySelectorAll('tag, category')].map(node => node.textContent.trim()).join(' ');
          return {title, href, content, tags};
        }).filter(Boolean);
        return new Fuse(posts, {
          keys: [{name: 'title', weight: .6}, {name: 'tags', weight: .25}, {name: 'content', weight: .15}],
          threshold: .25,
          ignoreLocation: true,
          ignoreFieldNorm: true
        });
      }).catch(error => {
        indexPromise = undefined;
        throw error;
      });
    }
    return indexPromise;
  }

  async function search() {
    const version = ++requestVersion;
    const query = input.value.trim().toLocaleLowerCase();
    results.replaceChildren();
    if (!query) {
      status.textContent = '输入关键词，搜索所有文章。';
      return;
    }
    status.textContent = '正在搜索…';
    try {
      const index = await loadIndex();
      if (version !== requestVersion || !searchDialog.shown) return;
      const terms = query.split(/\s+/);
      const matches = index.search({$and: terms.map(term => ({$or: [{title: term}, {tags: term}, {content: term}]}))})
        .map(result => result.item);
      status.textContent = matches.length ? `找到 ${matches.length} 篇文章${matches.length > 30 ? '，显示前 30 篇，请增加关键词缩小范围' : ''}。` : '没有找到相关文章。试试其他关键词，或清空搜索。';
      matches.slice(0, 30).forEach(post => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = post.href;
        const heading = document.createElement('h3');
        heading.textContent = post.title;
        const excerpt = document.createElement('p');
        const position = post.content.toLocaleLowerCase().indexOf(terms[0]);
        const start = Math.max(0, position - 35);
        excerpt.textContent = (start ? '…' : '') + post.content.slice(start, start + 130) + (post.content.length > start + 130 ? '…' : '');
        link.append(heading, excerpt);
        li.append(link);
        results.append(li);
      });
    } catch {
      if (version !== requestVersion || !searchDialog.shown) return;
      status.textContent = '搜索暂时不可用，请稍后重试。';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'ui-button text-button';
      retry.textContent = '重试';
      retry.addEventListener('click', search);
      status.append(retry);
    }
  }
  searchDialog.on('show', search);
  input.addEventListener('input', () => {
    ++requestVersion;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(search, 120);
  });
  dialog.querySelector('.search-clear').addEventListener('click', () => {
    clearTimeout(searchTimer);
    input.value = '';
    search();
    input.focus();
  });
  searchDialog.on('hide', () => {
    ++requestVersion;
    clearTimeout(searchTimer);
  });

  document.querySelectorAll('.prose figure.highlight, .prose pre').forEach(block => {
    if (block.matches('pre') && block.closest('figure.highlight')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    block.before(wrapper);
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';
    const label = document.createElement('span');
    const language = [...block.classList].find(name => name.startsWith('language-'))?.replace('language-', '')
      || [...block.classList].find(name => !['highlight', 'line-numbers'].includes(name));
    label.textContent = language ? language.toUpperCase() : 'CODE';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ui-button text-button copy-code';
    copy.textContent = '复制代码';
    copy.setAttribute('aria-label', '复制这段代码');
    copy.setAttribute('aria-live', 'polite');
    toolbar.append(label, copy);
    wrapper.append(toolbar, block);
    block.querySelector('.gutter')?.setAttribute('aria-hidden', 'true');
    block.tabIndex = 0;
    block.setAttribute('aria-label', `${label.textContent} 代码，可横向滚动`);
  });
  function codeText(trigger) {
      const block = trigger.closest('.code-block');
      const source = block.querySelector('.code pre') || block.querySelector('code') || block.querySelector('pre');
      const clone = source.cloneNode(true);
      clone.querySelectorAll('.line-numbers-rows').forEach(node => node.remove());
      clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
      return clone.textContent;
  }
  const clipboard = navigator.clipboard?.writeText ? null : new ClipboardJS('.copy-code', {text: codeText});
  const showCopyStatus = (button, message, state) => {
    button.textContent = message;
    button.dataset.state = state;
    clearTimeout(button.resetTimer);
    button.resetTimer = setTimeout(() => {
      button.textContent = '复制代码';
      delete button.dataset.state;
    }, 1800);
  };
  clipboard?.on('success', event => {
    event.clearSelection();
    showCopyStatus(event.trigger, '已复制', 'success');
  });
  clipboard?.on('error', event => showCopyStatus(event.trigger, '复制失败', 'error'));
  if (navigator.clipboard?.writeText) {
    document.querySelectorAll('.copy-code').forEach(button => button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(codeText(button)); showCopyStatus(button, '已复制', 'success'); }
      catch { showCopyStatus(button, '复制失败', 'error'); }
    }));
  }
  document.querySelectorAll('.prose table').forEach(table => {
    if (table.closest('.highlight')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', '表格，可横向滚动');
    table.before(wrapper);
    wrapper.append(table);
  });
  const tocLinks = [...document.querySelectorAll('.desktop-toc a[href^="#"]')];
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const current = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!current) return;
      tocLinks.forEach(link => {
        const active = decodeURIComponent(link.hash.slice(1)) === current.target.id;
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, {rootMargin: '0px 0px -65% 0px'});
    document.querySelectorAll('.prose h2[id], .prose h3[id]').forEach(heading => observer.observe(heading));
  }

  const shareSection = document.querySelector('.share-section');
  if (shareSection) {
    const copyLink = shareSection.querySelector('.copy-link');
    const shareStatus = shareSection.querySelector('.share-status');
    copyLink.hidden = false;
    if (navigator.clipboard?.writeText) {
      copyLink.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(copyLink.dataset.clipboardText); shareStatus.textContent = '文章链接已复制。'; }
        catch { shareStatus.textContent = '未能复制，请复制浏览器地址栏中的文章链接。'; }
      });
    } else {
      const linkClipboard = new ClipboardJS(copyLink);
      linkClipboard.on('success', e => { e.clearSelection(); shareStatus.textContent = '文章链接已复制。'; });
      linkClipboard.on('error', () => { shareStatus.textContent = '未能复制，请复制浏览器地址栏中的文章链接。'; });
    }
    const nativeShare = shareSection.querySelector('.native-share');
    if (navigator.share) {
      nativeShare.hidden = false;
      nativeShare.addEventListener('click', async () => {
        try { await navigator.share({title: shareSection.dataset.shareTitle, url: shareSection.dataset.shareUrl}); shareStatus.textContent = '已交给系统分享。'; }
        catch (error) { shareStatus.textContent = error.name === 'AbortError' ? '' : '系统分享暂时不可用，可以复制链接。'; }
      });
    }
  }

  if (shareSection) {
    const container = document.querySelector('#quote-dialog');
    const quoteDialog = new A11yDialog(container);
    const select = container.querySelector('#quote-select');
    const preview = container.querySelector('.quote-preview');
    const download = container.querySelector('.quote-download');
    const status = container.querySelector('.quote-status');
    const choices = [{label: '文章导读', text: shareSection.dataset.shareDescription}];
    // Keep a whole blockquote together so its attribution is never dropped.
    document.querySelectorAll('.prose > p, .prose > blockquote, .prose > ul > li').forEach(node => {
      if (node.querySelector('img, pre, ul, ol')) return;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (text.length >= 20 && text.length <= 240 && !choices.some(c => c.text === text)) choices.push({label: '正文 · ' + text.slice(0, 32), text});
    });
    choices.forEach((choice, index) => select.add(new Option(choice.label, String(index))));
    let objectUrl, version = 0;
    function renderQuote() {
      const currentVersion = ++version;
      status.textContent = '正在生成图片…';
      download.hidden = true; preview.hidden = true;
      try {
        const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1440;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f7f5ef'; ctx.fillRect(0, 0, 1080, 1440);
        ctx.fillStyle = '#964d3b'; ctx.fillRect(80, 84, 36, 4);
        ctx.font = '28px system-ui'; ctx.fillText('AresNing · ' + (select.value === '0' ? '文章导读' : '阅读摘录'), 140, 97);
        function wrap(text, font, maxWidth) {
          ctx.font = font; const lines = []; let line = '';
          for (const char of Array.from(text)) {
            if (ctx.measureText(line + char).width > maxWidth && line) { lines.push(line); line = ''; }
            line += char;
          }
          if (line) lines.push(line);
          return lines;
        }
        const quote = choices[Number(select.value)].text;
        const font = quote.length > 160 ? 40 : quote.length > 90 ? 52 : 64;
        const quoteLines = wrap(quote, font + 'px "Songti SC", serif', 920);
        ctx.fillStyle = '#292824'; quoteLines.forEach((line, i) => ctx.fillText(line, 80, 255 + i * (font * 1.65)));
        ctx.fillStyle = '#68645e';
        const titleLines = wrap('摘自《' + shareSection.dataset.shareTitle + '》', '26px system-ui', 920);
        titleLines.forEach((line, i) => ctx.fillText(line, 80, 1094 + i * 40));
        ctx.font = '22px system-ui';
        ctx.fillText(shareSection.dataset.quoteAttribution || 'AresNing · 学习与实践', 80, 1220);
        const urlLines = wrap(shareSection.dataset.shareUrl, '20px system-ui', 920);
        urlLines.forEach((line, i) => ctx.fillText(line, 80, 1280 + i * 30));
        ctx.fillStyle = '#dcd7cd'; ctx.fillRect(80, 1040, 920, 1);
        if (quoteLines.length * font * 1.65 + 255 > 1000 || titleLines.length > 3 || urlLines.length > 3) throw new Error('overflow');
        canvas.toBlob(blob => {
          if (currentVersion !== version) return;
          if (!blob) { status.textContent = '图片生成失败，请重试。'; return; }
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(blob);
          preview.src = objectUrl; preview.hidden = false;
          download.href = objectUrl; download.hidden = false;
          status.textContent = '图片已生成，尺寸为 1080 × 1440。';
        }, 'image/png');
      } catch { preview.hidden = true; status.textContent = '这段内容不适合当前图片尺寸，请选择较短的段落。'; }
    }
    const open = shareSection.querySelector('.quote-open'); open.hidden = false;
    open.addEventListener('click', () => quoteDialog.show());
    quoteDialog.on('show', renderQuote);
    select.addEventListener('change', renderQuote);
    quoteDialog.on('hide', () => { ++version; if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; preview.removeAttribute('src'); preview.hidden = true; download.hidden = true; });
  }
})();
