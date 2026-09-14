# 04 实验记录与证据边界

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重新执行实验。完整版本及归档哈希见 [versions.json](versions.json)。

## 本篇的观察范围

Pi 原始调度器测试整批前置准备、一项 sequential 对整批的影响、混合 terminate 与拒绝同伴；DeepSeek 原始 scheduler 测试滚动池、有序提交、动态 exclusive、取消及内部设施失败，共保留11项深入实验。registry、dispatch/finalize、session append 与模型响应为显式替身。早期 Pi 结果另包含完成顺序和历史顺序、长输出裁剪；不代表 bash/PTY 或完整权限管线验收。

## 保存的原始材料

- [deep-dive-results.json](deep-dive-results.json)
- [deep-dive-traces.json](deep-dive-traces.json)
- [pi-events.jsonl](pi-events.jsonl)
- [pi-lab-results.json](pi-lab-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](../experiments/README.md)
