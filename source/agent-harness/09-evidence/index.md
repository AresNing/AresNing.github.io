---
title: "09 实验记录与证据边界"
layout: page
eyebrow: 配套材料
---

[返回 09 正文](/agent-harness/09-clients/) · [下载完整材料](/downloads/agent-harness/09/agent-harness-09.zip)

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重新执行实验。完整版本及归档哈希见 [versions.json](/downloads/agent-harness/09/content/evidence/versions.json)。

## 本篇的观察范围

5项客户端局部检查直接调用 DeepSeek JsonRpcLineTransport 与 Pi output-guard：内存字节流验证并发响应关联、放弃等待后handler继续、close不销毁持有流；受控stdout回调验证增长tail屏障及EAGAIN同块重试。副作用为计数器。另附Pi早期结果支持agent_end订阅屏障的说明。未运行App Server、完整SDK子进程、真实网络重连或UI。

## 保存的原始材料

- [clients-results.json](/downloads/agent-harness/09/content/evidence/clients-results.json)
- [pi-events.jsonl](/downloads/agent-harness/09/content/evidence/pi-events.jsonl)
- [pi-lab-results.json](/downloads/agent-harness/09/content/evidence/pi-lab-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](/agent-harness/09-reproduce/)
