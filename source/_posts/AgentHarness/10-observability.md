---
title: "测试通过证明了什么？Harness 的观测证据与评分分母"
description: "机制反例通过，不等于产品可靠性通过；候选成功率百分之百，也可能排除了运行失败的样本。沿四种 Harness 的记录、关联、遥测与评测汇总，检查指标背后的证据和缺口。"
intro: "从原始事件到一个绿色指标，中间可能丢失时序、失败和分母。本文追查四套固定源码，区分机制断言、真实任务效果和观察链完整性，并说明回归结论需要哪些依据。"
kind: article
card_wrap: words
published: true
categories: [Agent Harness]
tags: ["Agent Harness", "源码阅读", "Coding Agent"]
date: 2026-09-14
updated: 2026-09-14
permalink: agent-harness/10-observability/
related: ["agent-harness/09-clients/", "agent-harness/11-design/"]
---

<figure class="article-figure"><a href="/images/agent-harness/10/10.svg" target="_blank" rel="noopener" aria-label="查看完整配图：可观测性与回归评测：机制正确性和真实模型效果分开验证"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/10/10-mobile.svg"><img src="/images/agent-harness/10/10.svg" alt="可观测性与回归评测：机制正确性和真实模型效果分开验证" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

08 篇有一项通过的实验，结论却是子进程没有按预期退出。09 篇也有一项通过的实验，结论是请求超时后服务端仍然执行。这里的“通过”表示实验成功识别了指定行为，不表示被测实现满足产品可靠性要求。假如报告只剩绿色数字，反例就会被读成质量背书。

这正是可观测性和评测共同面对的问题：原始事实经过采集、关联、归类、聚合，最后变成一个指标。每一步都可能改变含义。本篇继续审读[固定版本](/downloads/agent-harness/10/content/evidence/versions.json)的 writer、reducer、eval harness、遥测协调器与终态发射器，不把 README 中的承诺直接当成运行证据。2026-09-13 补充了 4 个局部实验，真实模型效果和远程遥测导出没有执行。

> 版本与证据：源码基线固定于 2026-09-12，实验记录来自 2026-09-12 至 13 日；本文于 2026-09-14 润色，未重新执行实验。源码事实、局部实验观察与设计判断分别表述，不代表四产品端到端验收。详见[本篇实验说明](/agent-harness/10-evidence/)。


## 一、先区分三种“重放”和两种“成功”

恢复重放为了继续运行，可能重新调用工具，必须面对副作用；诊断重放只解释已记录事实，不应该重新执行任务；评测重跑使用新的一次执行检验某个断言。三者可以共享事件格式，却不能共享一个含糊的 replay 按钮。06 篇讨论第一种，本篇主要讨论后两种。

同样，执行器成功和任务判分成功也要分开。执行器可以正常结束并返回错误答案；答案正确时，清理仍可能失败。评分器若先提取答案再忽略进程退出，可能把泄漏资源的运行计为成功。反过来，诊断记录丢失通常也不应该直接让用户任务失败。下面四种实现并没有选择一套统一的失败传播规则，原因在于它们拥有的责任不同。

## 二、Codex：原始事件的顺序，不等于模型可见历史的顺序

`TraceWriter` 用 mutex 保护写入状态，给事件分配递增 seq，把 JSON 行写入 BufWriter 并 flush。较大的 payload 则先写到独立文件，再返回可供事件引用的路径。这减少“事件已经存在，但引用文件尚未创建”的窗口。[writer 实现](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/writer.rs#L85-L159)

<!-- harness-diagram:10-codex -->

<figure class="article-figure"><a href="/images/agent-harness/10/10-codex.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Codex：运行事件与模型源证据可以先后错位"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/10/10-codex-mobile.svg"><img src="/images/agent-harness/10/10-codex.svg" alt="Codex：运行事件与模型源证据可以先后错位" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 10 · Codex：runtime 记录不是模型可见历史；源项晚到时先暂存关系。*

图示依据：[C10f](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/code_cell.rs#L80-L129)、[C10d](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/mod.rs#L39-L135)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

这里的写入保证需要限定到具体实现：该实现的 flush 是缓冲写出，并非每个文件都 fsync 的掉电事务；seq 在实际写出前就递增，写失败也不能被想象成自动回滚序号。它是诊断记录器，外层以 best-effort 方式使用，不能替代业务恢复日志的持久性协议。诊断失败不使 core 会话失败，是可用性取舍，也意味着事后证据可能不完整。[诊断入口约定](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/README.md#L94-L108)

reducer（将原始事件还原为关联记录的组件）还需要一张 pending 表。工具在模型流结束前就可能开始执行，因此 code cell 的 runtime start/end 记录可能早于“这段 JavaScript 来自哪个模型输出”的 payload。reducer 不把运行时输出直接当作模型可见对话，而是暂存 code cell，等模型可见源项出现后才建立归属。代码还拒绝重复的 cell start。这保留了生产者的真实事件次序，同时要求最终关联具有源证据。[暂存和重复检查](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/code_cell.rs#L80-L129) [待关联结构](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/mod.rs#L39-L135)

另一个容易误画的关系是 Responses 增量请求。请求可以只有新 input 和 `previous_response_id`。reducer 沿相同 thread 的前驱 inference 找到原 request/response 项，再补新 delta；前驱找不到就报错，不把缺失前缀当成空上下文。压缩之后的完整请求则需要对齐安装的 replacement snapshot，不能沿旧历史简单追加。[输入重建](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/conversation.rs#L19-L110)

因此一个可信查看器不能只把 JSONL 按时间排序后连线。该固定 reducer 主循环按文件行读取并调用 apply_event；不能仅凭文档里的“seq order”宣称它会自动修复乱序文件。序号用于证据关联，与工具依赖、模型历史位置是不同维度。[读取入口](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/mod.rs#L39-L135)

回到延迟归因，Codex 工具调度把 readiness 等待、并发准入锁、handler 执行和 result ready 分开。通过锁才标记 execution_started；handler 返回后、调用者编码和有序收集之前记录 result_ready。Fatal 错误不会产生普通 readiness 事件，取消路径则可能构造 aborted response 后记录 ready。于是 result_ready 的意思是“有结果可供消费”，不能等价为工具成功或已经进入下一次模型输入。[实际观测位置](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/parallel.rs#L130-L238)

一个慢工具报告至少应能回答：等环境多久、等调度多久、执行多久、结果等待提交多久。只计最后一个 duration，会把等待慢同伴的有序提交误判成自身执行慢。本轮没有构建 Rust reducer 或生成完整 Codex 运行包，上述结论属于源码路径分析。

## 三、Pi：会话执行、清理和评分分母分别影响结果

Pi eval harness 建立临时 workspace 和隔离 agent 目录，解析模型配置，再创建 AgentSession。它检查没有意外加载扩展；可选的系统提示变换以指定 inline extension 注入。这些目录与加载检查用于控制实验变量：否则个人机器多出的一个技能就可能改变工具选择，而被错误归因于模型版本。[隔离入口](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/pi-harness.ts#L109-L180) [实际会话检查](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/pi-harness.ts#L180-L289)

<!-- harness-diagram:10-pi -->

<figure class="article-figure"><a href="/images/agent-harness/10/10-pi.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Pi：100% 的分母可能只包含部分启动样本"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/10/10-pi-mobile.svg"><img src="/images/agent-harness/10/10-pi.svg" alt="Pi：100% 的分母可能只包含部分启动样本" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 10 · Pi：合成例：totalPairs=2，eligiblePairs=1，候选 pass rate 仍为 100%。*

图示依据：[P10e](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/vitest-evals/summary.ts#L164-L302)。原汇总器 + 合成 observations 实测。

<!-- /harness-diagram -->

`promptAgent` 只在本次 prompt 之后新增的消息里寻找最后一个 assistant，避免拿历史答案冒充新结果。它拒绝异常 stop reason，stop 且无文本也会失败；toolUse 则允许没有普通文本。这里得到的是 Harness 层可接受输出，是否答对仍由具体 eval 的断言决定。[本轮结果提取](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/pi-harness.ts#L109-L180)

取消也不只抛一个异常：AbortSignal 触发 session.abort，保存唯一 abortPromise，在 finally 中等待它。随后保存原生 session 文件为 artifact、dispose session、删除临时目录；清理错误会覆盖成功路径的正常返回，或与原执行错误组成 AggregateError。最终 totalMs 在这之后生成，因此包含相关清理时间。这个时间指标不能与只包住模型调用的计时直接比较。[取消、产物及清理](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/pi-harness.ts#L180-L289)

成本字段也没有无条件填 0：只有模型费用配置中存在正价格时才附 estimatedCostUsd。缺少价格意味着未知，不能当作免费。输入输出 token、cache token 和 tool count 则来自 session stats，表示该评测范围内累计量。[usage 构造](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/pi-harness.ts#L180-L289)

更容易遗漏的是配对汇总。`summary.ts` 在同一组和 repetition 内配对 baseline/candidate；每边必须恰好一条 observation。缺失、重复、Harness error、未评分都有独立 diagnostics。correctness 只纳入双方均为 scored 的对，score ≥ 1 才算 pass；token、耗时、成本还各自要求该指标为有限数值，所以不同指标的 eligiblePairs 也可能不同。[配对及分母实现](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/vitest-evals/summary.ts#L164-L302)

推论是“candidate pass rate = 100%”不代表所有启动的候选运行都成功。比如两组里一组双方可评分且通过，另一组候选 Harness 崩溃：汇总会给 totalPairs=2、eligiblePairs=1、candidatePassRate=1，同时给出 harness-error 诊断。只截图成功率会制造选择偏差；实现保留的分母和诊断就是解释这个数字的必要部分。新增原函数实验验证了这个反例，未运行真实模型 eval。

## 四、DeepSeek：授权到哪个前缀，交接游标就最多说明到哪一层

OTel backend 默认模式是 FEEDBACK_ONLY。反馈必须来自当前会话的显式事件：继承种子范围内的事件不授权新上传，message feedback 还要匹配 session ID。正常实时入口又检查 `session.eventAt(event.seq) === event`，防止一份看似相同的非 canonical 事件授权历史捕获。[反馈判定](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry-otel/src/index.ts#L55-L101) [canonical 身份检查](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry-otel/src/index.ts#L242-L312)

<!-- harness-diagram:10-deepseek -->

<figure class="article-figure"><a href="/images/agent-harness/10/10-deepseek.svg" target="_blank" rel="noopener" aria-label="查看完整配图：DeepSeek：最高 handoff 游标，不证明连续交付"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/10/10-deepseek-mobile.svg"><img src="/images/agent-harness/10/10-deepseek.svg" alt="DeepSeek：最高 handoff 游标，不证明连续交付" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 10 · DeepSeek：中间记录失败后，后续成功可能让下次捕获直接越过这个缺口。*

图示依据：[D10e](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry/src/coordinator.ts#L143-L250)。原 coordinator + 替身 sink 实测。

<!-- /harness-diagram -->

这次授权限定于相应的历史前缀，不自动覆盖后续全部事件。backend 以 on-demand coordinator 捕获到反馈 seq 为止的包含式前缀；后续新事件需要后续授权。对已提交反馈快照，它恢复一个 detached Session，但仍使用提交事件的 seq，不把恢复动作新增的 lifecycle marker 顺带纳入。backend 的公开直接 emit 则为空操作，阻止绕过私有捕获通路。[前缀捕获与直接记录](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry-otel/src/index.ts#L242-L312)

数据加工发生在捕获时：从 canonical log 复制 event.data，运行当时部署挂载的脱敏 waterfall，再交给 sink。这个包自身没有内置具体清洗规则，所以不能把“经过 redact 方法”理解为“已经脱敏”。复制避免稍后修改原 event 时改变已捕获的待导出 body；捕获时规则也意味着同一历史在不同捕获时刻可能接受不同政策。[复制与 waterfall](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry/src/coordinator.ts#L143-L250)

协调器用模块级 WeakMap 按 Session 对象记录最高 handoff seq。这样 telemetry fiber 热重载后，同一 session 对象无需把已经交接的历史重复提交；但这个状态不跨进程，也不是 collector 的接收确认。游标在 backend.emit 正常返回后更新，而 OTel emit 只是入 SDK 管线，之后仍有批处理、网络与丢失策略。[对象寿命与游标](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry/src/coordinator.ts#L48-L138) [交接位置](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry/src/coordinator.ts#L143-L250)

逐事件容错还有更细的代价：假设 seq 0 成功、seq 1 的脱敏或 sink 抛错、seq 2 成功。contain 只隔离失败项，让后续继续；游标随 seq 2 推进。下一次 capture 从 3 开始，不会因为 seq 1 曾失败就自动补洞。这个游标是最高已交接位置，不是连续全部交付的证明。补充实验实际得到接受序列 `[0,2]`，下一次捕获没有重试 1。[逐项包含与推进](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry/src/coordinator.ts#L143-L250)

关闭再提供另一种有界承诺。backend 把 provider.shutdown 与外层 deadline 做 Promise.race，默认 3 秒；达到期限会 reject，但没有因此取消 provider 内部工作。coordinator 的析构捕获该错误并告警，避免观测设施拖垮应用清理。OTel backend 还刻意没有实现可选 flush hint，以免引入并发 flush 与 shutdown drain 的交互。[deadline](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry-otel/src/index.ts#L242-L312) [外层容错](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry/src/coordinator.ts#L48-L138)

这个实现优先保持授权和主流程可用性，接受观测记录可能缺失的代价。不能据此宣称远程日志 exactly-once，更不能因为远程没有记录就认定运行时没有发生事件。本轮未启用遥测或调用远程 exporter。

## 五、Grok：终态记录需要覆盖“连正常返回都没走到”的路径

Grok 的 `TurnCompletionEmitter` 持有 session、模型、计时起点和 emitted 标记。正常终态由 emit 写 TurnCompleted；Drop 发现没有 emitted 时，补写 task_aborted。begin_turn_work 会把计时起点重锚到实际工作开始，使中止与正常结束的计时尽量使用同一阶段，而 setup 错误有专门入口。[发射器与 Drop](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L103-L177)

<!-- harness-diagram:10-grok -->

<figure class="article-figure"><a href="/images/agent-harness/10/10-grok.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Grok：正常返回没走到，也要保留终态线索"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/10/10-grok-mobile.svg"><img src="/images/agent-harness/10/10-grok.svg" alt="Grok：正常返回没走到，也要保留终态线索" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 10 · Grok Build：Drop 兜底依赖正常析构，不保证进程硬杀后仍能记录或导出。*

图示依据：[G10b](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L103-L177)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

这里保证的是作用域正常析构时的兜底路径，而不是进程硬杀后仍能产生遥测。emitted 在调用日志设施前置真，设施是否成功导出是下一层责任。源码注释的“exactly one”不能延伸成存储系统里 exactly-once；emit 本身也没有内部重入去重检查，依赖调用方正常只选择一个终态入口。

工具时长则通过 SignalEvent 发给 signals actor，保留 tool_name、tool_call_id、duration_ms。发送端不等待消费；actor 收到后追加当前轮 duration 项。TakeTurnEndSnapshot 在同一 channel 中处理，先前已入队事件先被消费，再计算累计 counter 的差值，并用 `mem::take` 取走每轮明细。[发送](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/signals.rs#L630-L644) [消费](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/signals.rs#L1164-L1176) [snapshot](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/signals.rs#L1331-L1402)

这一顺序对并行工具有用，但它只覆盖在 snapshot 前入队的观测，不会等待尚未把观测发送进队列的生产者。这里的 delta 是相邻快照之间的差，具体字段可能是差值、一次性明细或直接快照；例如 consecutive_cancellations 就保留当前值。直接把所有字段相加会重复计算，把两次 snapshot 当无副作用查询也会清空明细。因此，验证调用ID对应关系，还不足以验证快照的消费语义。

本轮未运行 Grok Rust 测试。Drop 与 signals actor 的分析说明应当在哪些位置设计故障注入，不等于已经验证了实际导出、进程崩溃或全部终态调用路径。

## 六、怎样把这些观察变成能证伪的回归实验

2026-09-13 的[4 组结果](/downloads/agent-harness/10/content/evidence/observability-results.json)中，3 组直接运行 DeepSeek coordinator 的 on-demand 分支，Session、Context 和 sink 是明确替身：交接后换 coordinator 不重复前缀；中间失败可被后续游标越过；授权前缀限制、复制以及捕获时规则分别生效。第 4 组运行 Pi 原配对汇总器，验证前文 2 个总配对、1 个可评分配对的分母反例。它们没有验证 canonical feedback 身份门、Cordis 热重载或 OTel 网络。

系列已有实验也应按这种方式阅读：先写竞争假设，再指定控制点，最后写能区分两者的断言。取消实验要等待真正退出，不能只检查 cancelled 字段；超时实验要在客户端拒绝后释放服务端闸门，观察后续副作用；重放实验要比较实际外部记录数，不能只比较最后一条消息。

故意缺陷检查同样需要边界。已有独立权限示例能抓住“拒绝仍执行”的变体，只证明该示例的断言有辨别力，不代表上游完整 permission suite 做过 mutation testing。上游 Pi 两个测试文件此前在加载阶段失败，执行了 0 项测试；后续局部实验通过不改变这条历史。[实验矩阵](/agent-harness/10-evidence/)

## 七、报告里必须同时保留结果、缺口和归因范围

| 要回答的问题 | 必要证据 | 不足以替代它的信号 |
|---|---|---|
| 工具为何慢 | 等待、执行、ready、提交的同一 call 关联 | 一个会话总耗时 |
| 模型实际看见什么 | 请求 payload、前驱和压缩 replacement | runtime 工具输出 |
| 遥测是否完整 | 授权范围、交接缺口、导出结果各层状态 | 最高 handoff seq |
| 修改是否改善效果 | 同组重复运行、评分规则、可用分母及错误诊断 | 通过的局部机制实验数 |
| 取消是否完成 | 运行停止与资源退出分别观测 | RPC error 或状态标签 |

我的设计判断是保留三个并行结论：机制断言成立吗，真实任务效果改善吗，观察链足以支撑归因吗。缺少第三个时，不应该直接把回归归因于模型；缺少第二个时，不应该根据机制测试通过推断任务能力提升；第一层出错时，也不能用平均任务成功率掩盖明确的资源泄漏。

下一篇将据这些具体差异审计本系列自己的离线查看器：它实际保存了哪些事实，哪些关系只是推断，哪些能力尚未实现。这些边界也将决定查看器应该展示什么、拒绝推断什么。

<!-- harness-diagram:10-summary -->

<figure class="article-figure"><a href="/images/agent-harness/10/10-summary.svg" target="_blank" rel="noopener" aria-label="查看完整配图：观测与评测必须保留缺口和分母"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/10/10-summary-mobile.svg"><img src="/images/agent-harness/10/10-summary.svg" alt="观测与评测必须保留缺口和分母" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 10 · 本篇总结：绿色检查表示指定断言成立；不代表产品可靠性或真实任务质量已验收。*

图示依据：[C10f](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/code_cell.rs#L80-L129)、[P10e](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/vitest-evals/summary.ts#L164-L302)、[D10e](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry/src/coordinator.ts#L143-L250)、[G10b](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L103-L177)。跨实现比较 · 根据本篇已引源码与明确的实验范围。

<!-- /harness-diagram -->

## 配套材料

[阅读实验说明](/agent-harness/10-evidence/) · [阅读复现入口](/agent-harness/10-reproduce/) · [下载正文、原图与实验材料](/downloads/agent-harness/10/agent-harness-10.zip)（[SHA-256](/downloads/agent-harness/10/agent-harness-10.zip.sha256)）。

下载包保留本篇最终正文、6 张原图、固定版本记录及实验源码；不含上游源码或依赖。复现实验需要联网准备环境，既有实验边界见说明。

<!-- harness-series-nav -->

## 系列阅读

[上一篇：界面显示已完成时，Harness 承诺了什么？](/agent-harness/09-clients/) · [下一篇：从四种 Harness 到自己的设计：用离线查看器检验取舍](/agent-harness/11-design/)

<!-- /harness-series-nav -->
