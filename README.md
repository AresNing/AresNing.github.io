# AresNing's blog

基于 Hexo 的个人编程博客，当前使用本站独立的 `paper`（素纸）主题：暖白纸面、墨灰文字、宋体标题与朱砂点色。

## 本地预览

```sh
npm ci
npm run clean
npm run build
npm run server -- --port 4317
```

打开 <http://localhost:4317>。`public/` 是生成目录，不要直接修改；仓库根目录原有的 `index.html`、`css/`、`js/` 是旧版静态产物，本次保留，不作为开发预览入口。

## 维护

- 文章：`source/_posts/`，沿用原有 Markdown 和永久链接规则。
- 页面模板：`themes/paper/layout/`。
- 配色、字体、间距与响应式：`themes/paper/source/css/paper.css`。
- 组件接入与站点业务逻辑：`themes/paper/source/js/paper.js`；锁定的上游分发文件及许可证由 `themes/paper/scripts/vendors.js` 随 Hexo 构建输出。
- 标题与摘要处理：`themes/paper/scripts/helpers.js`；保留既有标题锚点，为缺失锚点的一级正文标题补充唯一 ID。
- 搜索继续使用构建生成的 `search.xml`，无外部搜索服务或字体依赖。
- 完整设计和当前验收记录：[`design/paper-v1/design-system.md`](design/paper-v1/design-system.md)。

### 交互组件约定

新增通用交互优先复用成熟组件或浏览器原生控件。站点代码负责内容适配和视觉主题，不另写一套弹窗焦点管理、搜索匹配或剪贴板兼容逻辑。

| 场景 | 当前实现 | 样式约定 |
| --- | --- | --- |
| 搜索弹窗、手机导航 | [a11y-dialog 8.1.5](https://a11y-dialog.netlify.app/) | 共用 `.ui-dialog`、`.dialog-panel`；组件处理焦点约束、恢复、Esc 与遮罩关闭。 |
| 文章搜索 | [Fuse.js 7.5.0](https://www.fusejs.io/) | 标题、标签和正文加权搜索，多关键词组合，支持轻微拼写错误；索引仍为本地 `search.xml`。 |
| 代码复制 | [ClipboardJS 2.0.11](https://clipboardjs.com/) | 共用 `.ui-button`，以组件成功/失败事件显示结果；复制内容排除行号。 |
| 按钮、输入框、目录折叠 | 原生 `button`、`input`、`details` | 共用按钮、输入框和焦点样式；保留原生语义。 |

组件版本精确锁定在 `package.json` / `package-lock.json`，分发文件来自 npm 官方源，生成到 `public/lib/paper/`。Fuse.js 在首次输入搜索时加载。升级时同时检查桌面/手机的配色、字体、间距、按钮热区、焦点循环、关闭恢复、加载失败重试和复制结果。

修改文章或资源时 Hexo server 会监测变化，浏览器需要刷新；修改配置或主题脚本后重启服务，必要时先 clean 再 build。切回原主题可将 `_config.yml` 的 `theme` 改为 `next`，再重新构建；原 NexT 文件保留完整。

只有文章显式填写 `date` 时才显示发布日期；缺少日期的文章在归档中标记“未标注日期”。沿用 Hexo 原有排序与归档路径，不把文件时间展示为发布日期。空白和测试文章保留源文件，以 `published: false` 排除公开页面与搜索。

## 发布

本次为本地实现，未执行提交、推送或部署。现有 `npm run deploy` 会产生远端写入，确认发布范围后再执行，并以构建后的 `public/` 为准。

## 写作与分享

使用 `hexo new post <slug>` 创建草稿，按 [`scaffolds/post.md`](scaffolds/post.md) 填写字段；统一规范见 [`design/paper-v1/design-system.md`](design/paper-v1/design-system.md) 的“文章写作与传播规范”。

- `npm run verify`：构建并检查公开内容、分享元信息、PNG 封面、日期来源及草稿隔离。
- 文章封面由 `@resvg/resvg-js` 在构建时生成，中文字体使用随仓库提供的 Noto Serif CJK SC（SIL OFL）；字体仅在构建使用，不传给读者。来源及许可证见 `themes/paper/assets/fonts/`。
- 摘录使用 a11y-dialog + 原生 select、Canvas；支持原文段落选择与 1080 × 1440 PNG 保存。系统分享由浏览器 Web Share API 提供，复制优先使用原生 Clipboard API，不支持时使用 ClipboardJS。
- 外观提供跟随系统、浅色、深色；仅保存用户的本地偏好。分享图片统一保持浅色纸张模板。
