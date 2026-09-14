---
title: "07 实验记录与证据边界"
layout: page
eyebrow: 配套材料
---

[返回 07 正文](/agent-harness/07-extensions/) · [下载完整材料](/downloads/agent-harness/07/agent-harness-07.zip)

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重新执行实验。完整版本及归档哈希见 [versions.json](/downloads/agent-harness/07/content/evidence/versions.json)。

## 本篇的观察范围

Pi durable HookRegistry 的3组检查验证顺序变换、before/after异常和注销快照；vendored Cordis 的5组检查验证setup/cleanup等待、单effect与多effect顺序、依赖替换和清理失败，共8组。另附早期Pi轻量loop结果，支持副作用已发生而after回调失败的观察。Context和核心模块为原始实现，gate、回调、资源与同步门为替身；未运行Codex/Grok Hook引擎或完整第三方插件组合。

## 保存的原始材料

- [extensions-results.json](/downloads/agent-harness/07/content/evidence/extensions-results.json)
- [pi-events.jsonl](/downloads/agent-harness/07/content/evidence/pi-events.jsonl)
- [pi-lab-results.json](/downloads/agent-harness/07/content/evidence/pi-lab-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](/agent-harness/07-reproduce/)
