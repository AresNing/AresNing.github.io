# 08 实验记录与证据边界

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重新执行实验。完整版本及归档哈希见 [versions.json](versions.json)。

## 本篇的观察范围

7组原模块检查：Pi示例4组、DeepSeek3组。Pi runSingleAgent/mapWithConcurrencyLimit 通过AST原样提取，CLI命令解析替换为受控Node子进程，spawn仍为真实系统调用。取消反例等待原5秒timer触发，确认child仍存活后显式SIGKILL并等待收尾；另设8秒watchdog防止实验异常时遗留。结果字段watchdogKillRequired表示需要额外强杀，不能据字段名推断兜底timer实际触发。DeepSeek策略/settleRun使用测试服务和受控结果/清理函数，不是完整child driver验收。

## 保存的原始材料

- [subagent-extraction.json](subagent-extraction.json)
- [subagent-results.json](subagent-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](../experiments/README.md)
