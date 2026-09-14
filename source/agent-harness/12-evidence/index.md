---
title: "12 实验记录与证据边界"
layout: page
eyebrow: 配套材料
---

[返回 12 正文](/agent-harness/12-client-recovery/) · [下载完整材料](/downloads/agent-harness/12/agent-harness-12.zip)

本篇 18 项检查执行于 2026-09-14；所有上游源码仍固定在 2026-09-12 的提交。历史实验未重跑。完整版本及归档哈希见 [versions.json](/downloads/agent-harness/12/content/evidence/versions.json)。

## 本篇的观察范围

2026-09-14 新执行 18 项受控检查：Pi 事件总线/reducer、DeepSeek journal/assistant reducer 共 12 项；作者反例/计量 5 项；Codex/Grok 原 Rust 函数提取程序 1 项。carrier、页源、事件值和外围容器为 fixture。没有四产品端到端网络、工具继续、磁盘恢复或真实模型验收。

## 保存的原始材料

- [client-recovery-diagram-validation.json](/downloads/agent-harness/12/content/evidence/client-recovery-diagram-validation.json)
- [client-recovery-mechanism-results.json](/downloads/agent-harness/12/content/evidence/client-recovery-mechanism-results.json)
- [client-recovery-module-sources.json](/downloads/agent-harness/12/content/evidence/client-recovery-module-sources.json)
- [client-recovery-reproduction.json](/downloads/agent-harness/12/content/evidence/client-recovery-reproduction.json)
- [client-recovery-results.json](/downloads/agent-harness/12/content/evidence/client-recovery-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析，并运行了一个原函数提取程序；该程序不等于完整产品。Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次完成文章、附件检查与上述 18 项局部/独立检查；7 张 SVG 另做手机宽度静态渲染检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](/agent-harness/12-reproduce/)
