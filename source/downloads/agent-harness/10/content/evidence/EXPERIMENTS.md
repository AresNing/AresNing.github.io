# 10 实验记录与证据边界

原记录日期：2026-09-12 至 13 日。本次于 2026-09-14 核对附件和正文，没有重新执行实验。完整版本及归档哈希见 [versions.json](versions.json)。

## 本篇的观察范围

4组局部实验：3组调用 DeepSeek coordinator 的on-demand分支，以Session/Context/sink替身验证前缀、交接缺口、捕获复制与当时规则；1组调用Pi原配对汇总器，用合成observations验证totalPairs=2、eligiblePairs=1时candidatePassRate仍可为1。另附独立机制示例，供核对故意“拒绝仍执行”的变体。未运行真实模型eval、canonical反馈身份门、Cordis热重载或OTel远程导出。

## 保存的原始材料

- [mechanism-results.json](mechanism-results.json)
- [observability-results.json](observability-results.json)

结果文件保留原实验组全部条目。passed 表示观察符合该项断言，不等于产品能力或取消、恢复保证通过；机制反例也可能以 passed=true 记录。

## 未验证范围

Codex 和 Grok Build 的正文链路为固定版本源码分析；Pi 和 DeepSeek 的局部模块实验不代替完整产品构建、真实模型任务、OS 隔离、产品网络或崩溃恢复验收。此前尝试 Pi 上游测试时在加载阶段失败，实际执行数为 0；局部机制实验未改变这项记录。

本次只完成文章与附件检查。浏览器呈现、博客构建和公开发布由发布环节另行验证；包内历史实验状态不会自动更新成网站验收结果。

[复现入口](../experiments/README.md)
