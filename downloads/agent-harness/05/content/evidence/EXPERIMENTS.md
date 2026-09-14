# 05 实验记录与证据边界

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重新执行实验。完整版本及归档哈希见 [versions.json](versions.json)。

## 本篇的观察范围

Pi 的局部实验观察 before Hook 拒绝后 execute 为0，以及拒绝B不阻止已获准A。DeepSeek 5组实验直接调用 approveEscalation 和参数配对原函数，审批 responder 为测试替身；检查严格扩大、缺失服务、非允许结果和等待/身份传递。没有运行真实审批服务、命令执行器或OS沙箱；signal原样传递不等于取消链路已验收。

## 保存的原始材料

- [deep-dive-results.json](deep-dive-results.json)
- [deep-dive-traces.json](deep-dive-traces.json)
- [permission-results.json](permission-results.json)
- [pi-events.jsonl](pi-events.jsonl)
- [pi-lab-results.json](pi-lab-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](../experiments/README.md)
