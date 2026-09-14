# 03 配套实验复现入口

本目录提供正文引用的实验源码与原始结果，记录来自 2026-09-12 至 13 日，本次润色未重跑。范围见[本篇实验说明](../evidence/EXPERIMENTS.md)。包内没有上游源码或依赖。

## 准备源码与依赖

原记录环境为 macOS Apple Silicon、Node 22.19.0、Python 3.11.16。在包含 articles、evidence、experiments、research 的解压目录执行：

```sh
python3 research/fetch_sources.py
cd research/repos/pi
npm ci --ignore-scripts --no-audit --no-fund
cd ../../..
```

脚本下载公开固定源码，校验归档哈希后解压，不覆盖已存在的源码目录。使用干净目录复现，避免旧源码混入。只运行 Python 独立机制示例或查看器时，不需要上面的源码及 Node 依赖准备。

## 执行本篇对应实验

```sh
node experiments/build.mjs
node experiments/pi-lab.mjs
node experiments/protocol-context-build.mjs
node experiments/protocol-context-lab.mjs
```

构建入口与实验源码保持原样；build.mjs 如在包内，会同时构建 Pi 与 DeepSeek 初始实验，运行范围以上面列出的命令为准。命令会覆盖对应结果文件，保留原记录时请先复制解压目录。生成的 bundle 不随包分发。

这组命令没有运行四个完整产品或调用真实模型。结果符合断言也可能表示复现了失败行为；应同时阅读测试的输入、控制点、观察与边界。
