---
title: "01 实验记录与证据边界"
layout: page
eyebrow: 配套材料
---

[返回 01 正文](/agent-harness/01-turn-boundaries/) · [下载完整材料](/downloads/agent-harness/01/agent-harness-01.zip)

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重新执行实验。完整版本及归档哈希见 [versions.json](/downloads/agent-harness/01/content/evidence/versions.json)。

## 本篇的观察范围

Pi 原始循环注入两批工具及最终文本，记录 3 次 turn_end、1 次 agent_end；三个取消位置的合成副作用分别为 0、0、1。补充实验在 prepareNextTurn 内追加输入，确认下一次请求接纳它；停止条件成立时 follow-up 轮询次数为 0。订阅者通过可释放同步门阻塞 prompt 结算，没有执行故意死锁实验。DeepSeek 调度结果随 deep-dive 整组保留，不是本篇 phase 状态机的运行验收。

## 保存的原始材料

- [deep-dive-results.json](/downloads/agent-harness/01/content/evidence/deep-dive-results.json)
- [deep-dive-traces.json](/downloads/agent-harness/01/content/evidence/deep-dive-traces.json)
- [pi-events.jsonl](/downloads/agent-harness/01/content/evidence/pi-events.jsonl)
- [pi-lab-results.json](/downloads/agent-harness/01/content/evidence/pi-lab-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](/agent-harness/01-reproduce/)
