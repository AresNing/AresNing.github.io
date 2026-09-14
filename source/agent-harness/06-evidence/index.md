---
title: "06 实验记录与证据边界"
layout: page
eyebrow: 配套材料
---

[返回 06 正文](/agent-harness/06-recovery/) · [下载完整材料](/downloads/agent-harness/06/agent-harness-06.zip)

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重新执行实验。完整版本及归档哈希见 [versions.json](/downloads/agent-harness/06/content/evidence/versions.json)。

## 本篇的观察范围

独立机制示例使用真实子进程和 SQLite：worker 提交 operation-1 后 os._exit(73)，父进程确认数据库已有记录而结果文件缺失；朴素恢复得到2条效果，副作用数据库以唯一操作键去重的版本为1条。保存的 mechanism-results 还包含其它独立示例。此实验没有向 Codex、Pi、DeepSeek 或 Grok 产品注入崩溃；四条恢复链路均为固定源码分析。

## 保存的原始材料

- [mechanism-results.json](/downloads/agent-harness/06/content/evidence/mechanism-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](/agent-harness/06-reproduce/)
