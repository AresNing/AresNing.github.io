---
title: "失败之后，Agent 如何继续？四个 Harness 的重试、检查点与恢复策略"
description: "工具已完成外部写入，结果却来不及保存，恢复时能否重跑？从四种 Harness 的有效历史、持久结果、日志落盘和部分回滚入手，分析每一步继续执行需要什么证据。"
intro: "历史里没有结果，既不能证明工具没执行，也不能证明它已经成功。本文区分恢复上下文、重放工具与回滚工作区，并用独立故障实验说明外部系统为何必须参与去重。"
kind: article
card_wrap: words
card_title_lines: ["失败之后，Agent 如何继续？", "四个 Harness 的重试、", "检查点与恢复策略"]
published: true
categories: [Agent Harness]
tags: ["Agent Harness", "源码阅读", "Coding Agent"]
date: 2026-09-14
updated: 2026-09-14
permalink: agent-harness/06-recovery/
related: ["agent-harness/05-permissions/", "agent-harness/07-extensions/"]
---

<figure class="article-figure"><a href="/images/agent-harness/06/06.svg" target="_blank" rel="noopener" aria-label="查看完整配图：失败之后，Agent 如何继续？四个 Harness 的重试、检查点与恢复策略：历史缺少结果，不代表操作没有发生"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/06/06-mobile.svg"><img src="/images/agent-harness/06/06.svg" alt="失败之后，Agent 如何继续？四个 Harness 的重试、检查点与恢复策略：历史缺少结果，不代表操作没有发生" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

工具已经提交一次外部写入，Harness 却在保存结果前崩溃。重启以后，日志里只剩一个尚未结束的调用。此时“再跑一次”可能造成重复，“当作成功”可能虚构结果，“恢复 checkpoint”也未必能触及外部系统。

恢复真正要回答的是：系统掌握了什么证据，可以据此采取哪一步行动。四个项目在这里展示的并非同一种能力：Codex 从运行记录（rollout）重建回滚后仍有效的上下文；Pi 的 durable Harness 持有工具意图和重放策略；DeepSeek 区分日志抽象与具体后端的落盘边界；Grok 同时处理工作区、Git 与 hunk 状态的 rewind。

本篇基于[固定源码版本](/downloads/agent-harness/06/content/evidence/versions.json)。文中的进程崩溃实验为独立机制实验，确实运行了子进程退出和数据库查询，但没有向这四个产品注入崩溃。源码追踪与产品恢复验收分别陈述。

> 版本与证据：源码基线固定于 2026-09-12，实验记录来自 2026-09-12 至 13 日；本文于 2026-09-14 润色，未重新执行实验。源码事实、局部实验观察与设计判断分别表述，不代表四产品端到端验收。详见[本篇实验说明](/agent-harness/06-evidence/)。


延伸阅读：本篇关注执行失败后的重试、检查点与恢复。如果服务端仍在运行，只是客户端断线，问题会转为如何重新确认状态、补历史并接回实时进度，见[第 12 篇：断线之后，Agent 的进度如何接上？](https://aresning.github.io/agent-harness/12-client-recovery/)。

## 用故障窗口替代一个含糊的“已保存”

工具执行至少经过以下状态：意图被记录、实际执行开始、外部效果提交、结果被 Harness 接纳、结果达到后端声明的持久性边界、结果进入可供下一轮使用的历史。实现可以合并其中某些边界，却不能假定所有边界天然原子。

<figure class="article-figure"><a href="/images/agent-harness/06/06-structure.svg" target="_blank" rel="noopener" aria-label="查看完整配图：外部效果与本地记录之间的故障窗口"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/06/06-structure-mobile.svg"><img src="/images/agent-harness/06/06-structure.svg" alt="外部效果与本地记录之间的故障窗口" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

进程内的 `finally` 能帮助正常退出或可捕获异常的收尾，无法在强制崩溃后补写这段缺失记录。文件系统 checkpoint 可以撤销某些文件变化，也无法自动撤回发送给外部服务的请求。因而，恢复协议应明确区分重建历史、重放执行和补偿外部效果。

## Codex：先找仍有效的 checkpoint，再重放后续历史

`RolloutReconstruction` 不只包含 messages，还携带 retained context、guardian history、上轮设置、reference context、world-state baseline 和 context window 身份。它们必须由同一次 replay 推导，否则历史回到旧状态，基线却还指向被撤销的新状态，后续增量上下文就可能建立在错误前提上。[重建对象与段状态](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/rollout_reconstruction.rs#L1-L125)

<!-- harness-diagram:06-codex -->

<figure class="article-figure"><a href="/images/agent-harness/06/06-codex.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Codex：先确定哪段历史仍然存活"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/06/06-codex-mobile.svg"><img src="/images/agent-harness/06/06-codex.svg" alt="Codex：先确定哪段历史仍然存活" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 06 · Codex：恢复重建依赖 rollback 与 checkpoint 的关系，不能盲目读最后一条摘要。*

图示依据：[C06c](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/rollout_reconstruction.rs#L330-L420)、[C06](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/rollout_reconstruction.rs#L1-L125)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

实现先逆序扫描 rollout，把记录聚成 turn segment。下文的“存活”指该段未被后续回滚撤销，仍可用于恢复。遇到 `ThreadRolledBack(N)`，将待跳过的用户轮次数累加；每次 finalize segment 时，如果它被 rollback 覆盖，就不使用其中的 checkpoint 和恢复元数据。不是每个 `TurnContext` 都算一轮：代码还区分真实用户边界与仅携带上下文的段。具体匹配也包括用户边界形式的 ResponseItem 和 inter-agent communication，因此不能只按某一种事件的行数截断。[逆序分段与边界识别](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/rollout_reconstruction.rs#L129-L321)

为什么不能直接找文件里最后一个 compaction？考虑三个阶段：A 建立有效历史；B 产生新的压缩 checkpoint；随后用户回滚 B。如果无视 rollback，最新 checkpoint 已经吸收了被删除的内容。Codex 在确认 segment 存活后才接受其中的 replacement-history checkpoint，并把 checkpoint 与其 suffix 配成同一个 `ReplayCheckpoint`，避免从一段取基线、从另一段取尾部。

逆序扫描确定基线后，代码再向前重放 suffix，保留 ResponseItem、retained context 和 rollback 的真实先后语义。较新的 replacement checkpoint 若属于被撤销的 turn，不替换已选基线；其原始记录仍可让后面的 rollback 找到要删除的用户边界。找到 checkpoint 不等于停止处理尾部的撤销事件。[基线安装与正向重放](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/rollout_reconstruction.rs#L330-L420)

`NeverSet`、`Cleared`、`Latest` 则解决另一类恢复错误。逆向扫描还没见过 reference context，是“尚未取得证据”；遇到 compaction 后的明确清除，是“禁止从更早历史捡回旧基线”。两者最终都可能输出 None，但扫描过程中不能合并，否则会把压缩已经使之失效的基线重新复活。

world state 也按存活记录正序重放：compaction 清空基线，full snapshot 建立基线，merge patch 只应用于已存在的基线；没有 full snapshot 的 patch 被忽略并告警。对于没有 replacement history 的旧 compaction，代码走兼容重建并清空 reference context，注释承认恢复 prompt 的形状可能暂时不同于原运行。这是一个明确的兼容性折中，而不是完全忠实重现所有旧状态。[旧格式与 world-state replay](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/rollout_reconstruction.rs#L375-L465)

这些分支共同维护的是**上下文内部一致性**。这里的 world state 是供上下文使用的快照与差异，不能因名称相同就理解成对真实文件、进程和网络世界的回滚。重建函数也没有按历史重新执行每个工具；它重建的是下一步决策可依赖的记录。把它写成通用 exactly-once 恢复，会超出源码所支持的结论。

## Pi：durable Harness 把“未完成”继续拆成几种状态

本系列前几篇多次研究 Pi 的轻量 `runAgentLoop`。恢复能力则需要另读 `packages/agent/src/harness/runtime`；不能拿轻量 loop 的内存数组推断整个仓库没有持久化协议，也不能把 durable Harness 的保证自动赋给所有轻量 Agent 使用方式。

<!-- harness-diagram:06-pi -->

<figure class="article-figure"><a href="/images/agent-harness/06/06-pi.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Pi durable：允许重放需要旧声明和新声明同时成立"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/06/06-pi-mobile.svg"><img src="/images/agent-harness/06/06-pi.svg" alt="Pi durable：允许重放需要旧声明和新声明同时成立" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 06 · Pi：缺失结果只能说明未知；不满足声明的安全条件时，不会沿该分支重新执行。*

图示依据：[P06i](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L515-L545)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

工具批次中的状态至少有 `planned`、`effect_pending`、`outcome_ready`。正常执行先准备参数并运行 before Hook，再通过 `publishToolIntent` 在一次 lane commit 中保存执行参数和 `effect_pending` 状态，随后才调用工具。结果身份 `resultEntryId` 在更早的计划阶段已预留，不是每次恢复随机生成一个新身份。[执行意图提交](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L186-L237)

执行结束后，`publishToolOutcome` 把结果存成 pending entry，切换状态到 `outcome_ready`，同时删除中间输出与 invocation memo。之后再通过 materialization（将已保存结果放入历史的步骤），按批次源顺序纳入历史。因此，并行工具可能已经完成并保存结果，却还没有出现在最终历史位置；恢复应该先 materialize 已完成结果，不能因为历史里暂时缺少它就再执行。[结果提交](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L238-L291)、[有序 materialization](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tool-placement.ts#L80-L177)、[批次恢复入口](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L655-L691)

对真正停留在 `effect_pending` 的调用，`recoverToolInvocation` 使用一个双重条件：持久化调用记录的 `replay` 为 safe，当前加载的工具也仍声明 safe，而且没有取消，才允许重新调用。任意一个条件不满足，就读取保存的 partial checkpoint，生成 interrupted outcome。[安全重放判断](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L515-L545)

两个 safe 的交集很有意义。旧调用当时未声明可重放，不能因为今天工具改成 safe 就追认；旧调用声明 safe，今天工具撤销这个承诺，也不能继续依赖旧配置。这是防止配置演进扩大恢复权限的保守门槛，但 safe 本身仍是工具作者的契约，不是 Harness 自动证明了幂等性。

重放使用保存下来的参数，先清除旧 partial checkpoint，再通过 `performToolInvocation` 执行。[已存参数读取](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L296-L341)。它不回到 `prepareToolInvocation` 重新跑普通 before Hook。这一具体路径说明，safe replay 不能只考虑重复写入，还需要考虑授权是否具有时效性：恢复是否仍可使用原先获准的动作，需要工具或部署的恢复契约明确处理。这里是由调用链推导的设计边界，不是对现有插件的漏洞认定。

普通 progress update 与恢复证据也不同。`performToolInvocation` 每次都可发布 UI update，只有带 `checkpoint: true` 的 partial 才写入持久进度通道；结束时 seal 并 drain 该通道。unsafe 或取消恢复只能使用已保存的 checkpoint，不能重现仅发送给 UI 的最新内容。中间输出可以帮助说明未知结果，却不会因为被显示过就变成完成确认。[进度与执行收尾](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L349-L415)

工具 invocation 还提供稳定 `invocationId` 和 memo 接口，执行结束后使 capability 失效，并检查当前 lane 是否仍拥有对应 effect。它能帮助工具围绕稳定身份保存查询或去重所需信息；本地 memo 与外部写入仍没有自动共享事务，不能据此承诺跨系统恰好一次。[invocation 身份与权限失效](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L83-L143)

模型生成的恢复是另一条线。`recoverAssistantGeneration` 根据已提交 frame 前缀合成 `stopReason: error` 的消息，usage 置零，并标记 external outcome unknown。这个函数本身不再调用 provider；**但不能由此推出整个恢复流程永不重试模型**。它随后进入 `publishResponse`，若处于 assistant effect、本次是 recovery 且还没用完 `maxAttempts`，会转成 `assistant.retry_wait`，为下一次尝试保留 generation context。[孤立生成](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/recovery.ts#L1-L90)、[恢复后的重试状态](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/response.ts#L275-L295)

完整路径的语义是：先明确结算失去所有者的旧 attempt，再按重试预算决定是否发起后续 attempt；后续新尝试不等于找回了旧请求的真实完整结果。零 usage 也表示恢复消息没有完整用量证据，不能当成远端没有消耗资源。

## DeepSeek：通用接口、显式 append、实时事件队列是三个承诺

`SessionHandle` 接口允许 backend 在 append 接纳并使批次有序可见之后缓冲物理写入，flush 才提供对应的崩溃持久性屏障。这个契约支持不同后端，但不能反向推断“所有后端的 append 都不耐久”。[通用存储契约](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence/src/handle.ts#L1-L117)

<!-- harness-diagram:06-deepseek -->

<figure class="article-figure"><a href="/images/agent-harness/06/06-deepseek.svg" target="_blank" rel="noopener" aria-label="查看完整配图：DeepSeek：可见、排队与持久化是不同承诺"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/06/06-deepseek-mobile.svg"><img src="/images/agent-harness/06/06-deepseek.svg" alt="DeepSeek：可见、排队与持久化是不同承诺" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 06 · DeepSeek：观察到 session 事件，不代表 JSONL 存储已经完成对应写入。*

图示依据：[D06d](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts#L267-L371)、[D06](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence/src/handle.ts#L1-L117)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

继续读 `session-persistence-jsonl` 会得到更强、也更具体的结论。显式 `handle.append(events)` 在排入串行 mutation chain 之前验证并深拷贝 batch，避免调用者在等待期间修改将被持久化的数据。随后检查写入权限、取得跨进程 write lease、确认 sequence 连续，再执行 `persistBatch`；存储成功后才推进 cursor。[JSONL handle 的实际提交](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts#L183-L214)、[连续性、lease 与 cursor](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts#L267-L371)

深拷贝发生在排队之前，这个顺序会影响实际写入的内容。若先排队、之后才读取原对象，调用返回前调用者修改字段，验证过的值和写入值就可能不是同一个。cursor 在成功之后推进，则使失败重试仍针对同一个序列位置，而非跳过尚未确认的 batch。

底层 `appendLines` 记录文件原长度，写入后执行 `sync`。写入或同步失败时，关闭追加句柄，将文件截回原长度并再次同步，然后抛出错误；回滚本身失败会返回 AggregateError。这样处理是为了避免 cursor 没前进、文件里却残留部分 batch，下一次重试重复序号。它是一个带恢复动作的失败协议，不等于遇到任何文件系统故障都能保证完好。[追加与失败回滚](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/index.ts#L1242-L1285)

这个后端的实现契约将显式 append 成功返回视为完成持久写入，所以已 materialized 的 handle，其 `flush()` 可以直接返回。对于从未写事件的空 session，flush 则要创建并持久化 header，使空会话本身也能存活。这与只阅读接口得出的最弱承诺不同。

然而，上层实时 session event 并不都逐条等待这个显式 append。backend 安装的 `session/event` listener 将事件克隆进 live buffer，经过有界 batching window 再 drain。`session/flush` 的接线先 `drainLive()`，随后才 `writer.flush()`。因此，“JSONL append 已经 fsync”仍不能推出“UI 看见的每个 session event 都已经 fsync”。读调用方走哪条入口，与读后端如何写同样重要。[实时队列](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts#L267-L371)、[flush 接线](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts#L525-L550)

drain 失败时把 batch 放回队首并暂停，保留与之后事件的顺序；后续显式 flush 能重试并向调用方暴露失败。close 也负责排空 live buffer、释放 lease，并聚合排空与锁释放错误。正常 teardown 可以使用这些边界，但进程强制退出仍会丢失尚未 drain 的内存事件。

恢复写入还会先处理撕裂尾部：截断物理坏尾，再重写已经解析恢复的完整事件，最后追加新 batch；每步成功才清除对应修复状态。这说明日志恢复处理的不只是 JSON 能否解析，还包括物理尾部与逻辑 cursor 的一致性。本文未运行真实 JSONL backend 的断电或双写者验收；以上是具体代码路径，不是本机耐久性测试报告。

## Grok：文件 rewind 成功，不等于所有恢复域都成功

Grok 的 `TurnBoundary` 将普通 turn Hook 与 prompt rewind RPC 分开：`prompt_index: None` 驱动 turn 活动，`Some(index)` 才走对应 rewind 捕获入口。结构名都含 turn boundary，并不表示每次都会产生同样的快照效果。[边界入口](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/session/checkpoint.rs#L1-L110)

<!-- harness-diagram:06-grok -->

<figure class="article-figure"><a href="/images/agent-harness/06/06-grok.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Grok：恢复要分别检查各个状态域"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/06/06-grok-mobile.svg"><img src="/images/agent-harness/06/06-grok.svg" alt="Grok：恢复要分别检查各个状态域" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 06 · Grok Build：文件 rewind 返回成功，不代表 Git、会话与 live tracker 都完成恢复。*

图示依据：[G06d](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/session/checkpoint_store.rs#L460-L483)、[G06](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/session/checkpoint.rs#L1-L110)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

`RewindCheckpoint` 实际序列化字段是 prompt index、文件系统 rewind point 和可选 hunk delta。文件顶部概述提到 Git 域，但 Git checkpoint 由另一套 store 管理，不能据概述声称这个 JSON blob 自带完整 Git 状态。hunk 与 durable 开关在此固定版本都默认关闭。[checkpoint 结构与开关](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/session/checkpoint.rs#L1-L110)

沿 `rewind_to` 往下，Git soft restore 先执行，让 stash/abort 保护逻辑看到尚未回滚的 live state，然后才运行 `rewind_files`。即使 Git 没恢复成功，代码仍可继续回滚文件，并记录 partial rewind。文件恢复成功后，才按条件 restage、截断 Git checkpoint、恢复 hunk 数据及删除较新的持久镜像。[跨域恢复次序](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/session/checkpoint.rs#L345-L425)

因此，这不是多个恢复域的原子事务。Git 已改变但文件恢复失败，或者文件成功而没有可用 Git checkpoint，都可能形成部分结果。函数最终返回文件系统的 `FileRewindResponse`；仅根据它的 success 展示“全部已恢复”，会比实现保证更强。这个结论来自返回值与分支，而不是因为产品有 Git 功能就假设会自动撤销所有状态。

持久 checkpoint store 本身也值得细读。`persist` 与 `truncate_from` 共用 I/O 锁，避免 finalize 和 rewind 交错后磁盘、缓存各保留不同的 checkpoint。写 blob 使用含进程 ID 和递增序号的临时文件，先 `sync_all`，再 rename，目录同步是 best effort。rename 负责最终路径不出现半个 JSON，文件同步负责数据落地，目录同步又是新目录项的另一道边界。[镜像串行化](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/session/checkpoint_store.rs#L130-L187)、[物理写入步骤](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/session/checkpoint_store.rs#L267-L295)

但这个机制当前还是 **持久镜像（durability mirror）**，不是完整恢复消费端。构造 store 时可以从磁盘重新装入 cache，而读取 checkpoint 并重新初始化实时跟踪器（live trackers）的生产消费者，在固定版本代码中仍注明未接线；读取 helper 位于 `#[cfg(test)]` 内。由磁盘测试能读回 blob，不能推出重启后的工作区 rewind 已端到端可用。[尚未接线的消费端](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/session/checkpoint_store.rs#L460-L483)

还有一个调用方可见性的区别：`persist` 遇到 mkdir 或写入失败时记录 warn 然后返回，其返回类型不携带 Result。上层不能仅凭 `await persist_checkpoint()` 正常结束，就宣布持久镜像已保存。对比 DeepSeek 显式 append 的失败传播，这两条路径向调用者提供的证据强度并不一样。

## 故障实验：缺失结果无法区分“没执行”和“已经完成”

[独立机制实验](/downloads/agent-harness/06/content/experiments/mechanism_lab.py)让 worker 向 SQLite 提交 operation-1，然后调用 `os._exit(73)`，不写结果文件。父进程验证外部效果表已有记录，结果文件不存在，再用相同逻辑操作身份发起恢复执行。

朴素版本最终出现两条效果；拥有唯一 operation key、在副作用数据库里执行幂等插入的版本仍只有一条。退出码、文件缺失及数据库行数均由实际进程和查询验证。[运行结果](/downloads/agent-harness/06/content/evidence/mechanism-results.json)

两种算法恢复时看见的是同样的“本地结果缺失”，区别在于副作用所有者是否参与去重。因而，仅在 Harness 日志里新增一个 operation ID，并不能复制实验的保证。Pi 的稳定 invocation ID 提供了可用身份，但工具仍要把它传给支持幂等或查询的外部系统；Codex 的历史重建、DeepSeek 的日志 fsync、Grok 的文件镜像，也都不能独自消除跨系统提交之间的故障窗口。

| 故障点 | 源码中可利用的证据 | 可以采取的恢复动作 | 仍不能推断的事实 |
|---|---|---|---|
| 被回滚的 turn 含压缩记录 | Codex 存活段和对应 checkpoint | 重建有效上下文与基线 | 外部效果已撤销 |
| 工具结果已保存但未入历史 | Pi outcome_ready 与预留结果 ID | 完成 materialization | 所有 pending 工具均可重跑 |
| 工具执行结果未知 | Pi persisted/current replay 双条件 | safe 时重放，否则带 checkpoint 报中断 | safe 标签自动证明幂等 |
| session event 只在内存队列 | DeepSeek live buffer 与 drain/flush | 排空并传播失败 | UI 已显示等于已落盘 |
| 文件已回滚、Git 未成功 | Grok 分域结果与告警 | 报告部分恢复，保留相应重试依据 | 单个 success 代表全部域完成 |

我会把恢复能力看成一个逐层收紧的证据链：先确定记录能恢复到哪里，再确定哪项操作具有稳定身份，最后确定副作用所有者支持查询、幂等还是补偿。能自动继续的部分应自动继续；无法区分完成与未完成的部分，应准确保留未知。恢复器应如实保留这些边界，让每一步继续执行都有可解释的依据。

<!-- harness-diagram:06-summary -->

<figure class="article-figure"><a href="/images/agent-harness/06/06-summary.svg" target="_blank" rel="noopener" aria-label="查看完整配图：恢复成功必须说明恢复了哪个状态域"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/06/06-summary-mobile.svg"><img src="/images/agent-harness/06/06-summary.svg" alt="恢复成功必须说明恢复了哪个状态域" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 06 · 本篇总结：没有结果只意味着证据缺失；不能直接推断没执行或安全可重跑。*

图示依据：[C06c](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/rollout_reconstruction.rs#L330-L420)、[P06i](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L515-L545)、[D06d](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts#L267-L371)、[G06d](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/session/checkpoint_store.rs#L460-L483)。跨实现比较 · 根据本篇已引源码与明确的实验范围。

<!-- /harness-diagram -->

## 配套材料

[阅读实验说明](/agent-harness/06-evidence/) · [阅读复现入口](/agent-harness/06-reproduce/) · [下载正文、原图与实验材料](/downloads/agent-harness/06/agent-harness-06.zip)（[SHA-256](/downloads/agent-harness/06/agent-harness-06.zip.sha256)）。

下载包保留本篇最终正文、6 张原图、固定版本记录及实验源码；不含上游源码或依赖。复现实验需要联网准备环境，既有实验边界见说明。

<!-- harness-series-nav -->

## 系列阅读

[上一篇：一次批准改变了什么？四种 Harness 的权限与沙箱](/agent-harness/05-permissions/) · [下一篇：多个 Hook 如何协作？四种 Harness 的扩展与卸载](/agent-harness/07-extensions/)

<!-- /harness-series-nav -->
