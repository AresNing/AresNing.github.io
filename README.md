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
| 文章搜索 | [Fuse.js 7.5.0](https://www.fusejs.io/) | 标题、标签和正文加权搜索，多关键词组合与拼写容错；命中词高亮、片段定位、结果整行打开；索引仍为本地 `search.xml`。 |
| 代码与链接复制 | 原生 Clipboard API，兼容回退使用 [ClipboardJS 2.0.11](https://clipboardjs.com/) | 共用 `.ui-button`，显示实际复制结果；代码排除行号、保留换行。 |
| 外观胶囊切换 | 原生 `fieldset`、`radio` | 系统 / 浅色 / 深色互斥选择；方向键切换，选中项反色显示，沿用本地偏好记忆。 |
| 文章分享菜单 | 原生 [Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) + [Floating UI DOM 1.8.0](https://floating-ui.com/docs/computeposition) | 原生弹层负责 Esc、外部点击和焦点顺序；Floating UI 负责左侧对齐、滚动跟随、翻转与边缘避让。不支持时直接展示操作链接。 |
| 按钮、输入框、目录折叠 | 原生 `button`、`input`、`details` | 共用按钮、输入框和焦点样式；保留原生语义。 |

组件版本精确锁定在 `package.json` / `package-lock.json`，分发文件来自 npm 官方源，生成到 `public/lib/paper/`。Fuse.js 在首次输入搜索时加载。升级时同时检查桌面/手机的配色、字体、间距、按钮热区、焦点循环、关闭恢复、加载失败重试和复制结果。

修改文章或资源时 Hexo server 会监测变化，浏览器需要刷新；修改配置或主题脚本后重启服务，必要时先 clean 再 build。切回原主题可将 `_config.yml` 的 `theme` 改为 `next`，再重新构建；原 NexT 文件保留完整。

只有文章显式填写 `date` 时才显示发布日期；缺少日期的文章在归档中标记“未标注日期”。沿用 Hexo 原有排序与归档路径，不把文件时间展示为发布日期。空白和测试文章保留源文件，以 `published: false` 排除公开页面与搜索。

## 发布

2026-09-14 第 06 篇已改题并发布：[失败之后，Agent 如何继续？四个 Harness 的重试、检查点与恢复策略](https://aresning.github.io/agent-harness/06-recovery/)。内容源码 `5ef7602`，静态提交 `320e2e2`，Pages 为 `built`；49 项公开资源回读一致，前后篇导航、开篇双版本图、下载包和新封面已同步。保留现有正文、文章排序、分享菜单及作者介绍。X 临时卡片仍显示旧标题/封面，未记新版本平台验收通过。

2026-09-14 分享菜单已上线：功能源码 `be535f3`，缓存版本修正 `ac3550c`，静态提交 `4a47c3c`；Pages 为 `built`。139 项公开页面/资源回读一致，桌面深色与手机浅色菜单实际验收通过。文章、原有列表顺序及分享封面保持不变；本次为限定分享区与资源引用的发布，构建排序边界见设计文档。

2026-09-14 已发布 Agent Harness 全系列 00–11，共 12 篇：[从导读开始](https://aresning.github.io/agent-harness/00-overview/) · [全部篇目](https://aresning.github.io/categories/Agent-Harness/) · [轨迹查看器](https://aresning.github.io/agent-harness/11-viewer/)。源码保存在 `source`，最终内容提交为 `1a2bc22`；线上使用 `main` 根目录，静态发布提交为 `84b3481`，Pages 状态为 `built`。482 项公开资源回读一致，实际浏览器系列导航与查看器交互通过；X 后续篇封面预览尚未完整通过，详见设计文档验收记录。

后续发布先执行 `npm run clean && npm run verify`，再将 `public/` 同步到基于远端 `main` 的独立工作区，提交并正常推送，保留分支历史。发布需要明确授权；不要直接使用带强制推送行为的默认部署器。发布后核对 Pages 状态、公开页面和实际目标平台分享预览。

## 写作与分享

使用 `hexo new post <slug>` 创建草稿，按 [`scaffolds/post.md`](scaffolds/post.md) 填写字段；统一规范见 [`design/paper-v1/design-system.md`](design/paper-v1/design-system.md) 的“文章写作与传播规范”。

- `npm run verify`：构建并检查公开内容、分享元信息、PNG 封面、日期来源及草稿隔离。
- 文章封面由 `@resvg/resvg-js` 在构建时生成，中文字体使用随仓库提供的 Noto Serif CJK SC（SIL OFL）；字体仅在构建使用，不传给读者。来源及许可证见 `themes/paper/assets/fonts/`。
- 摘录使用 a11y-dialog + 原生 select、Canvas；支持原文段落选择与 1080 × 1440 PNG 保存。系统分享由浏览器 Web Share API 提供，复制优先使用原生 Clipboard API，不支持时使用 ClipboardJS。
- 外观提供跟随系统、浅色、深色；仅保存用户的本地偏好。分享图片统一保持浅色纸张模板。

### Agent Harness 系列

已按最终润色包接入 00–11 全部文章。00 导读入口：`source/_posts/AgentHarness/00-overview.md`，固定地址 `agent-harness/00-overview/`。12 篇使用前后篇导航连接。实验说明与复现入口为独立页面；公开附件实体保存在 `source/downloads/agent-harness/00/` 至 `11/`，以 `skip_render` 原样输出。正文不依赖其他任务目录或私有仓库。

接收冻结 ZIP 后先核对 SHA-256 与逐文件清单，再完整复制到博客工作区。公开 ZIP 只包含正文、原图和相关实验材料；交接元数据不放入网站。保留固定源码链接与实验边界；正文的网页适配与下载原稿分开保留。原始 HTML 属于下载材料，构建时检查字节一致；适配查看器位于 `source/agent-harness/11-viewer/`。
