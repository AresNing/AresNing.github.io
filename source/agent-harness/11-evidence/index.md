---
title: "11 实验记录与证据边界"
layout: page
eyebrow: 配套材料
---

[返回 11 正文](/agent-harness/11-design/) · [下载完整材料](/downloads/agent-harness/11/agent-harness-11.zip)

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重跑历史机制实验，仅复跑查看器9项检查。完整版本及归档哈希见 [versions.json](/downloads/agent-harness/11/content/evidence/versions.json)。

## 本篇的观察范围

本篇的运行原型是只读Pi轨迹查看器，内嵌188条早期合成任务产生的原生事件。子进程和客户端反例沿用2026-09-13的记录，未重跑。2026-09-14在独立交付副本重新运行查看器9项检查，另核对188条输入与HTML重新生成结果一致；这不包含浏览器点击、真实模型或四产品集成验收。查看器没有文件上传、实时订阅、取消控制或跨产品状态机。

## 保存的原始材料

- [clients-results.json](/downloads/agent-harness/11/content/evidence/clients-results.json)
- [pi-events.jsonl](/downloads/agent-harness/11/content/evidence/pi-events.jsonl)
- [subagent-extraction.json](/downloads/agent-harness/11/content/evidence/subagent-extraction.json)
- [subagent-results.json](/downloads/agent-harness/11/content/evidence/subagent-results.json)
- [trace-viewer.html](/agent-harness/11-viewer/)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](/agent-harness/11-reproduce/)
