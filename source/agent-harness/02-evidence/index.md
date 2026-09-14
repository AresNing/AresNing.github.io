---
title: "02 实验记录与证据边界"
layout: page
eyebrow: 配套材料
---

[返回 02 正文](/agent-harness/02-model-streams/) · [下载完整材料](/downloads/agent-harness/02/agent-harness-02.zip)

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重新执行实验。完整版本及归档哈希见 [versions.json](/downloads/agent-harness/02/content/evidence/versions.json)。

## 本篇的观察范围

原 Pi 实验使用脚本化响应，观察 length 或 error 消息含工具时是否执行。协议组共11项，本文使用其中8项：4项调用 Pi 原始请求重试函数，4项调用 DeepSeek 原始组装器和严格校验器；同组另3项上下文切点检查为下一篇使用。重试回调抛出带状态与响应头的 Error，没有启动 HTTP/SSE 服务。严格 wrapper 经测试上下文注册，不证明所有产品 profile 默认启用。

## 保存的原始材料

- [pi-events.jsonl](/downloads/agent-harness/02/content/evidence/pi-events.jsonl)
- [pi-lab-results.json](/downloads/agent-harness/02/content/evidence/pi-lab-results.json)
- [protocol-context-extraction.json](/downloads/agent-harness/02/content/evidence/protocol-context-extraction.json)
- [protocol-context-results.json](/downloads/agent-harness/02/content/evidence/protocol-context-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](/agent-harness/02-reproduce/)
