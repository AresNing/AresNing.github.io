---
title: 00 导读：实验记录与结论边界
layout: page
eyebrow: 配套材料
---

[返回 00 导读](/agent-harness/00-overview/) · [下载完整材料](/downloads/agent-harness/00/agent-harness-00.zip)

本附件摘取导读实际使用的实验依据。记录来自 2026-09-12 至 13 日，2026-09-14 核对并整理；本次润色没有重新执行实验。原环境为 macOS Apple Silicon、Node 22.19.0、Python 3.11.16，版本和归档校验值见 [versions.json](/downloads/agent-harness/00/content/evidence/versions.json)。

## 本文使用的观察

| 正文中的问题 | 被测路径与输入 | 保存的观察 | 原始记录 |
| --- | --- | --- | --- |
| 一次请求有几种结束边界 | Pi 原始 core，固定返回两批工具及最终文本；工具写入为合成副作用 | 3 次内部 turn 结束、1 次 Agent run 结束、2 次写入 | [Pi 结果](/downloads/agent-harness/00/content/evidence/pi-lab-results.json)，场景 `01-two-tool-batches`；[188 条事件](/downloads/agent-harness/00/content/evidence/pi-events.jsonl) |
| 停止以后还会轮询 follow-up 吗 | Pi 原始循环，在工具完成后的停止条件处控制输入 | follow-up 轮询 0 次 | [深入实验结果](/downloads/agent-harness/00/content/evidence/deep-dive-results.json)，场景 `01-stop-before-followup-poll` |
| 同批工具是否要一起等准备完成 | Pi 原始工具调度，阻塞 B 的前置准备 | B 准备未释放时，工具 body 启动数为 0 | [深入实验结果](/downloads/agent-harness/00/content/evidence/deep-dive-results.json)，场景 `04-pi-all-preflight-before-body` |
| 后续工具补位是否等于结果已提交 | DeepSeek 原始 scheduler，registry、执行服务及内存 append 为替身 | C 可以补位，结果仍按调用顺序提交 | [深入实验结果](/downloads/agent-harness/00/content/evidence/deep-dive-results.json)，完整时序见[局部轨迹](/downloads/agent-harness/00/content/evidence/deep-dive-traces.json) |
| 客户端超时是否终止服务端工作 | DeepSeek 原始 `JsonRpcLineTransport`，内存字节流与受控 handler | 客户端先拒绝，释放 handler 后计数器副作用仍发生，迟到响应被忽略 | [客户端结果](/downloads/agent-harness/00/content/evidence/clients-results.json)，场景 `09-ds-abandonment-does-not-cancel-server` |

结果文件保留所在实验组的全部条目，避免摘取单一成功项后丢失上下文；它们包含 13、11、5 项检查。`passed` 表示观察符合该场景断言。例如超时后仍有副作用的反例通过，表示成功复现这一边界，不能读作取消保证通过。

## 原模块与替身分别是什么

Pi 实验使用固定源码的循环、EventStream 和参数校验路径；模型响应、工具输入与控制门为合成数据。构建桥接文件绕开未准备好的产品导出图，没有替换循环算法。直接调用 core，不等于启动 Pi CLI 或 durable Harness。

DeepSeek 调度实验调用原始 `tool-calls.ts`、消息构造器和值工具；构建器从 tools 模块原样提取两个常量，registry、prepare/dispatch/finalize 与 session append 是测试服务。它不验证完整插件装配、真实审批或持久化 flush。

客户端实验使用内存字节流，没有启动完整服务端、建立产品网络连接或执行真实模型任务。这里的“服务端副作用”具体指测试计数器，不能推广为所有业务动作的行为保证。

## 没有验证的范围

- Codex、Grok Build：正文对应路径为固定版本源码分析，未构建或运行产品。
- Pi、DeepSeek：局部原模块实验不代表完整产品构建、安装或端到端验收。此前尝试 Pi 上游测试时在模块加载阶段失败，实际执行数为 0；局部实验通过不替代该结果。
- 未进行真实模型任务成功率、成本或性能排名；未逐一验证四产品的操作系统隔离、崩溃恢复或真实客户端重连。
- 本次交付检查的是文字、引用及附件完整性；网站构建、浏览器呈现和公开发布由博客发布环节另行验证。

复现入口见[复现说明](/agent-harness/00-reproduce/)。包内不含上游源码归档、依赖或带本机路径的失败日志。
