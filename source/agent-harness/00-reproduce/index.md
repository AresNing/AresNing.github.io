---
title: 00 导读：配套实验复现入口
layout: page
---

[返回 00 导读](/agent-harness/00-overview/) · [下载完整材料](/downloads/agent-harness/00/agent-harness-00.zip)

本目录随导读分发，保存正文所引三组实验的源码及构建入口。结果文件来自 2026-09-12 至 13 日，本次文章润色未重新运行；范围见[实验说明](/agent-harness/00-evidence/)。

## 准备

在解压后包含 `articles/`、`evidence/`、`experiments/` 和 `research/` 的目录执行。包内没有已下载的上游源码或依赖，需要联网准备：

```sh
python3 research/fetch_sources.py
cd research/repos/pi
npm ci --ignore-scripts --no-audit --no-fund
cd ../../..
```

原记录环境为 Node 22.19.0、Python 3.11.16、macOS Apple Silicon。下载脚本获取 `versions.json` 固定的四个公开归档，校验 SHA-256 后解压；已存在的源码目录保留，不会覆盖。重新复现时应使用干净目录，以免旧目录影响结果。依赖安装使用 Pi 的锁文件，禁用生命周期脚本。

## 执行

```sh
node experiments/build.mjs
node experiments/pi-lab.mjs
node experiments/deep-dive-build.mjs
node experiments/deep-dive-lab.mjs
node experiments/clients-build.mjs
node experiments/clients-lab.mjs
```

`build.mjs` 沿用原始入口，同时生成 Pi 和 DeepSeek 初始实验 bundle；为保持入口完整，包内也附带 `deepseek-lab.ts`，上面的命令没有执行它。后两组分别运行局部调度与客户端协议实验。输出会覆盖相应的 `evidence/` 结果；如需保留原记录，请先复制解压目录。

测试源码中的替身、同步门和结果字段是证据范围的一部分。检查符合断言不等于真实模型效果验证，也不代表四产品的部署或生产验收。本包没有调用真实模型的配置或凭据。
