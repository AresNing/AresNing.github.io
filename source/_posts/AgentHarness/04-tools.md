---
title: "工具并发怎样保持顺序？四种 Harness 的准备、执行与提交"
description: "多个工具同时运行，不代表审批、后处理和历史提交也能并发。沿四种 Harness 的调度器比较屏障、执行池、锁和结果顺序，解释快工具为什么仍会等待。"
intro: "同一批工具既有文件依赖，又有审批和独立查询，该如何安排？本文拆开准备、启动、完成、后处理与历史提交五个时点，用真实调度路径和局部反例解释等待。"
kind: article
card_wrap: words
published: true
categories: [Agent Harness]
tags: ["Agent Harness", "源码阅读", "Coding Agent"]
date: 2026-09-14
updated: 2026-09-14
permalink: agent-harness/04-tools/
related: ["agent-harness/03-context/", "agent-harness/05-permissions/"]
---

<figure class="article-figure"><a href="/images/agent-harness/04/04.svg" target="_blank" rel="noopener" aria-label="查看完整配图：工具执行与并发：完成顺序可以不同于模型历史顺序"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/04/04-mobile.svg"><img src="/images/agent-harness/04/04.svg" alt="工具执行与并发：完成顺序可以不同于模型历史顺序" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

模型在同一次响应里提出三个调用：A 修改配置文件，B 读取同一个文件，C 查询独立服务。最省事的执行器是 `Promise.all([A,B,C])`；最保守的执行器是逐项 await。前者可能让 B 读到旧值，后者又让独立的 C 无谓等待。再加上“B 需要审批”和“执行过程中插件改变了 C 的并发资格”，这就不再是一道选择串行或并行的二选一题。

本文沿四套[固定源码](/downloads/agent-harness/04/content/evidence/versions.json)追查准备、启动、结果处理和历史提交，比较实际决定顺序的容器、锁与分支。Pi core 和 DeepSeek scheduler 的局部实验提供受控时序观察；Codex/Grok 的行为分析依据源码及只读未运行的上游测试。

> 版本与证据：源码基线固定于 2026-09-12，实验记录来自 2026-09-12 至 13 日；本文于 2026-09-14 润色，未重新执行实验。源码事实、局部实验观察与设计判断分别表述，不代表四产品端到端验收。详见[本篇实验说明](/agent-harness/04-evidence/)。


## 先区分五个顺序，才能看出实现差异

这里把工具实际执行函数称为 body。对一次调用 i，定义 `Pᵢ` 为参数及前置决策完成，`Sᵢ` 为 body 启动，`Eᵢ` 为 body 返回，`Fᵢ` 为后置处理完成，`Hᵢ` 为结果进入模型历史。

正常调用内部一般需要 `Pᵢ → Sᵢ → Eᵢ → Fᵢ → Hᵢ`，但并不要求不同调用的同类阶段顺序一致。A 先被模型提出，B 可以先执行完；B 的结果又可能为了稳定历史而等到 A 后面才提交。

还有一个容易误读的事件：`tool_execution_start` 未必等于 `Sᵢ`。Pi 在参数准备前就发这个事件；被校验或 Hook 拒绝的调用也可以拥有 start/end 事件，却从未进入工具 body。所以统计“开始了多少次工具”时，必须先确定测的是意图接纳、调度准入还是副作用入口。[Pi 准备与事件次序](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L409-L550)

这五种顺序分别服务不同目标：审批顺序关乎用户理解，启动顺序关乎依赖，完成顺序关乎响应性，后置处理顺序关乎扩展观察，历史顺序关乎重放与下一次模型输入。一个实现把其中两项固定为同序，必然也接受相应等待成本。

## Pi：整批前置屏障，然后并发执行，再统一提交

### 并发入口先检查整批是否必须串行

<!-- harness-diagram:04-pi -->

<figure class="article-figure"><a href="/images/agent-harness/04/04-pi.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Pi：整批准备屏障之后才并发执行"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/04/04-pi-mobile.svg"><img src="/images/agent-harness/04/04-pi.svg" alt="Pi：整批准备屏障之后才并发执行" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 04 · Pi：一项准备未完成，会影响其他项何时开始；最终结果按原序组织。*

图示依据：[P04](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L409-L550)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

`executeToolCalls` 不只看全局 `config.toolExecution`。它还扫描本批调用，在当前工具集合里找到对应定义；只要任意工具声明 `executionMode === "sequential"`，整批就转入 `executeToolCallsSequential`。[路由分支](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L409-L550)

这意味着 `[parallel A, parallel B, sequential C]` 不会变成“先 A/B 并发，再 C 独占”，而是 A、B、C 全部顺序执行。从实现取舍看，批次级决定减少了组内屏障安排；代价是 C 的声明也会使原本可并发的 A/B 顺序执行。

补充实验用同步门让 A 保持未完成，确认即使 C 位于最后，B 仍没有启动。它与仅配置全局 sequential 的旧实验不同，直接检验的是**一项工具元数据对整批的影响**。[实验源码](/downloads/agent-harness/04/content/experiments/deep-dive-lab.ts)

### 并发路径的准备阶段也不是并发

并发函数先用 for 循环逐项执行 `prepareToolCall`，为允许执行的调用保存异步闭包。这个阶段只有准备，尚未调用闭包。走完整个准备循环后，才通过 `Promise.all` 启动这些闭包。[完整并发路径](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L409-L550)

准备本身包含查工具、可选 `prepareArguments`、Schema 验证、`beforeToolCall`，以及 Hook 返回后的取消检查。Hook 看到的是经过准备和验证的参数，而原始 toolCall 仍被保留，便于区分模型输出与最终执行参数。[准备路径](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L550-L674)

对于 A 无需审批、B 在等待人工审批的例子，实际关系是：

```text
P_A 已完成
进入 P_B，等待批准
此时 S_A 尚未发生
P_B 完成后 → 启动 S_A、S_B
```

`04-pi-all-preflight-before-body` 在 B 的 before Hook 内暂停，记录 A/B body 次数仍是 0；释放后两者才都执行。这是当前实现的整批前置屏障，不能从“支持 parallel”猜出来。

这种结构让审批按模型提出顺序发生，也让本批执行之前的准备相对集中；但慢审批会压住同批所有已批准调用。一个带几十个工具的响应即使执行很快，前置决策也可能成为主要等待环节。

### 拒绝一个调用，不是回滚整个批次

如果 B 的 before Hook 返回 block，B 会形成 immediate error result；A 的已准备闭包仍留在列表中。只要没有其它取消条件，后续 `Promise.all` 仍会执行 A。新增 `04-pi-blocked-peer-is-not-batch-rollback` 观察到 A 执行、B 未执行，并继续了一次模型调用。

因此，前置屏障不等于事务预检。它没有承诺“只有全批批准才执行任何调用”。需要全批 all-or-nothing 的产品，必须定义更高层的决策和补偿，不能仅把几个工具放进同一个响应。

### 后置 Hook 顺序与历史顺序并不相同

每个闭包内部依次执行 body、`afterToolCall`、`tool_execution_end`。各闭包并发，因此 B 先返回时，B 的 after Hook 可以先运行。最后 `Promise.all` 按输入顺序返回结果数组，再逐项发送 toolResult 消息。[执行与后置变换](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L720-L773)、[统一提交](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L409-L550)

这带来一个具体约束：如果 A/B 的 after Hook 都修改共享计数、插件状态或上下文，不能因为历史最终是 A/B 顺序，就假定这些修改也按 A/B 发生。**历史按顺序记录，不能改变此前副作用和扩展实际发生的顺序。**

旧实验以 A 等待 B 的同步门保证完成事件 B→A，模型结果消息 A→B。源码进一步解释了原因：完成发生在并发闭包内，历史产生于有序数组遍历。不是某次事件碰巧乱序。[实际记录](/downloads/agent-harness/04/content/evidence/pi-lab-results.json)

### `terminate` 是批次续轮意见，不是紧急停止

`shouldTerminateToolBatch` 使用非空检查和 `every(result.terminate === true)`。它在结果收集完以后执行，并不遇到第一个 terminate 就取消兄弟调用。[聚合函数](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L550-L674)

补充实验安排 A terminate=true、B=false，模型调用次数是 2；两者都 true 时，次数是 1。两种情况下，工具 body 都已执行。这个语义很适合表达“本批结果一致认为无需模型继续处理”，却不适合承载“发现危险，立即停止所有兄弟任务”。后者要用明确的取消或策略门。

即使批次 terminate=true，也只结束工具驱动的自动续轮，steering/follow-up 仍由外层循环决定。不能把一个结果字段跨层解释成整个 Agent 永久停止。

## DeepSeek：滚动执行池和有序提交，是两个相互协调的推进过程

### slots 与游标各自记录什么

<!-- harness-diagram:04-deepseek -->

<figure class="article-figure"><a href="/images/agent-harness/04/04-deepseek.svg" target="_blank" rel="noopener" aria-label="查看完整配图：DeepSeek：滚动补位与有序提交是两条线"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/04/04-deepseek-mobile.svg"><img src="/images/agent-harness/04/04-deepseek.svg" alt="DeepSeek：滚动补位与有序提交是两条线" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 04 · DeepSeek：示意池容量为 2；C 可以先开始，结果仍按 A、B、C 提交。*

图示依据：[D04b](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/tool-calls.ts#L130-L290)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

`executeToolCalls` 先把模型调用变成 `PlannedCall`，每项保留 block 和独立的 execution input。`runGroup` 维护 `nextToStart`、`committed`、`started`、`inFlight` 和 `slots`。这几个状态承担不同职责：[数据结构与循环](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/tool-calls.ts#L1-L270)、[完整组调度](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/tool-calls.ts#L130-L290)

| 状态 | 回答的问题 |
|---|---|
| nextToStart | 下一项尚待准入的调用是谁 |
| inFlight | 哪些已分发 body 仍未结算 |
| slots[i] | 第 i 项结果是否已就绪，是否还需后置处理 |
| committed | 连续提交到哪个模型序号了 |
| schedulerFailure | 调度设施是否已经失去继续正常提交的条件 |

`fillPool` 在 `inFlight.size < maxParallelToolCalls` 时补充任务。每项 `prepare` 仍是有序 await，但一项 prepare 通过后即可 dispatch，不需要等整批其它 prepare 都完成。故 A 可以已经运行，执行器同时等待 B 的审批。这与 Pi 的整批前置屏障是实质差异。

当任一 body 返回，`Promise.race(inFlight.values())` 取出其索引，从 inFlight 删除，再尝试 commitReady 和继续补池。所以容量限制约束的是在途 dispatch，**不是所有尚未提交的结果槽位**。

### A 很慢，B 很快，C 是否能先启动

把容量设为 2：A 和 B 启动，A 等待，B 完成。此时 B 的 slot 已就绪，但 `committed` 指着尚未完成的 A，不能提交 B。与此同时 B 已不占 inFlight 名额，C 可以被补入池中。

```text
启动：A、B
B body 完成 → slot[B] 就绪
commitReady 停在 A
空出执行名额 → C 启动
A body 完成 → 按 A、B、C 的可用前缀逐项 finalize、记录
```

新增 `04-ds-rolling-pool-ordered-commit` 直接调用上游 scheduler，观察到 C 在 A 释放前已经启动，而 tool/result 记录仍为 0；最终结果按 A、B、C 提交，最大活动 body 为 2。[结果与完整局部轨迹](/downloads/agent-harness/04/content/evidence/deep-dive-results.json)、[轨迹数据](/downloads/agent-harness/04/content/evidence/deep-dive-traces.json)

这说明有界并发没有自动消除队头阻塞。它避免大量 body 同时运行，但慢 A 后面仍可能积累已完成结果。更大的池提高资源利用，也可能扩大暂存结果和下一次模型可见状态之间的差距。

### 后置处理为什么也放进 commitReady

`commitReady` 不只 append。它先根据 `needsPost` 调用 finalize 或 finish，再记录 tool/result，接受 `additionalContexts`，最后推进 committed。这使后置策略、结果与追加上下文都遵循模型顺序。[提交路径](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/tool-calls.ts#L130-L290)

与 Pi 相比，DeepSeek 付出了更强的顺序等待：B 的 body 虽已完成，B 的后置处理也可能等 A。收益是扩展不用从完成顺序中重建“第几项结果先改变了请求上下文”。代价是一个慢或阻塞的后置 Hook 会卡住提交游标，影响补池推进。

这里不能只用“都按原顺序提交”总结：Pi 对结果数组的最终遍历，不等价于 DeepSeek 将后置决策也放进有序提交阶段。

### 动态工具表改变时，尚未启动的调用要重新分类

每次开始后续调用前，scheduler 会重查 `executionMode`。若当前 parallel 组的下一项变成 exclusive，就停止补池，等本组在途调用全部收敛，再让外层把它作为独占组执行。上游测试专门覆盖结果观察者把后续调用改成 exclusive 的情况。[上游测试，仅审读](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/tests/tool-calls.spec.ts#L187-L245)

这比启动批次时一次性复制 parallel 标志更适合动态插件环境。它维护的是“以启动时的有效注册为准”的契约。反过来，模式不是不可变计划：刚拿到模型响应时看到的可并发性，未必就是几百毫秒后真正执行时的可并发性。

新增 `04-ds-live-exclusive-barrier` 在 A 的有序 finalize 后改变 C 的模式，验证 C 在 B 结束以后才执行。这里 registry 与工具服务是替身，测试的真实对象是调度器重查与屏障逻辑；不是完整 Cordis 插件替换验收。

### 取消和调度器内部故障，不走同一套补结果策略

正常取消时，scheduler 停止补池，等待已启动调用结算，按顺序提交它们的结果与附加上下文，然后为未启动项写入带 `ABORTED_BEFORE_DISPATCH` 的合成结果。每个结果通过 `sourceEventSeqs` 指向自己的 tool/call 事件。[取消分支](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/tool-calls.ts#L130-L290)

如果是调度设施自身的 reject，代码记录第一份 schedulerFailure，等待已启动 dispatch 收敛，然后抛出；它没有把每个缺失结果都补成普通取消结果。新增两个实验分别观察到：取消后 2 个已启动项加 1 个跳过项共有 3 个结果；内部 dispatch reject 的实验保留 2 个 tool/call，却没有伪造 tool/result。

后一个实验不能误读成“普通工具报错就丢结果”。正常工具错误可以作为 `isError` 结果返回；我们故意让调度服务的 dispatch promise reject，命中的是设施失败分支。只有按错误所属层区分，才能理解为什么同样“不成功”，有时应该补齐配对，有时必须暴露记录不完整。

结论聚合也与 Pi 不同：DeepSeek 对已提交结果使用 `concluded ||= result.concludesTurn === true`。任一项可以表达 turn 已完成；scheduler 仍继续本批。补充实验 A=true、B=false，结果 concluded=true，但两项都执行。它是上层 loop 的结束意见，不是短路调度器。

## Codex：请求视图、共享/独占锁和有序 drain 分别解决三个问题

### `Arc<StepContext>` 解决的是宣告与执行的一致性

<!-- harness-diagram:04-codex -->

<figure class="article-figure"><a href="/images/agent-harness/04/04-codex.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Codex：等待、执行与结果收集分别推进"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/04/04-codex-mobile.svg"><img src="/images/agent-harness/04/04-codex.svg" alt="Codex：等待、执行与结果收集分别推进" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 04 · Codex：result_ready 早于调用者编码或有序收集，不表示已进入下次模型输入。*

图示依据：[C04](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/parallel.rs#L42-L250)、[C10](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/parallel.rs#L130-L245)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

`ToolCallRuntime` 保存 step_context，而不是到工具真正启动时随手查询会话最新 router。源码注释明确说明，调用可能稍后执行，所以必须留住当初向模型宣告工具的那一个 step。[Runtime 所有权](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/parallel.rs#L42-L250)

否则存在一个典型交错：模型看见工具版本 V1；响应返回期间插件刷新为 V2；执行器按 V2 解释 V1 的参数。在类型名相同、Schema 改变时，问题尤其隐蔽。持有请求视图能够固定工具说明与执行解释之间的对应关系，但也意味着更新不会自动改变已经绑定到旧视图的调用。

这与 DeepSeek 重查未启动项模式的策略不能简单评为孰优孰劣。两者强调不同契约：一边强调请求宣告的一致性，一边强调启动准入时的实时注册。工具版本、撤销和并发资格究竟哪些冻结、哪些重查，需要分字段设计，不能简单规定“一切用快照”或“一切读最新”。

### `RwLock<()>` 是能力准入门，不是文件事务锁

Runtime 创建共享 RwLock。每个调用从 router 查询 supports_parallel；通过 ready 等待后，可并行项获取 read guard，其它项获取 write guard。guard 持有到 router dispatch 返回。这里的 read/write 是锁模式，不直接意味着工具读写磁盘。[锁与执行次序](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/parallel.rs#L42-L250)

如果三个工具都在同一 Runtime 的锁域里，独占工具不会与持锁的并行工具同时进入 dispatch；但锁不知道 A 写的文件就是 B 要读的文件。错误标为可并行的依赖调用，仍会出错。两个互不共享这把锁的 Runtime，也不能借它获得工作区级互斥。

因此，源码可以证明“这批调用遵守工具声明的共享/独占资格”，不能证明“任意路径冲突都被自动解决”。这一区别决定你该修工具声明、拆模型批次，还是把锁放到真正共享的资源服务里。

### 工具可先完成，历史要等采样流结束后再 drain

流处理中，已完成输出项经 `handle_output_item_done` 产生 tool_future，进入 `FuturesOrdered`；采样流结束后，代码调用 `drain_in_flight`，按该容器次序记录结果。[入队](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/turn.rs#L2605-L2645)、[收尾](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/turn.rs#L2990-L3007)、[落入历史](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/turn.rs#L2356-L2385)

工具 dispatch 自身可以更早结束。在 router 返回并释放锁后，Runtime 发出 result_ready 诊断事件，源码注释特意指出它早于采样侧编码和收集结果。这使“工具已准备好结果”和“结果已进入模型历史”有可观察的分界。[ready 事件](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/parallel.rs#L42-L250)

取消到来时还会检查 `terminal_outcome_reached` 或 handle 已完成。如果工具已到终态，优先等真实结果，而非机械地覆盖为 aborted；尚未完成时再 abort task，并生成中断结果。这个分支减少“已经成功却被后来取消伪装成未执行”的窗口，但它不能撤销已经发生的文件写入或远端操作。

## Grok Build：同路径局部锁，加上完成顺序的后处理

### 真正的调度器在 `tool_calls.rs`

<!-- harness-diagram:04-grok -->

<figure class="article-figure"><a href="/images/agent-harness/04/04-grok.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Grok：局部路径互斥，不等于业务依赖顺序"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/04/04-grok-mobile.svg"><img src="/images/agent-harness/04/04-grok.svg" alt="Grok：局部路径互斥，不等于业务依赖顺序" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 04 · Grok Build：完成序后处理与模型最初调用顺序是不同维度。*

图示依据：[G04d](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L928-L1064)、[G04c](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L518-L674)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

会话先将调用交给 `execute_tool_calls`，其中会把需要文件后置依赖的 exit-plan 类型拆到 tail，body 批次完成后再跑 tail。每一批进入 `execute_tool_calls_batch`，先逐项 prepare，把成功项放进 approved。[批次入口](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L381-L436)

在准备中遇到权限拒绝、取消或 follow-up，会设置 final_result，后续调用收到未执行结果。不过此前已进入 approved 的前缀并没有在这里被清空，后面仍进入 dispatch 构造阶段。[准备与批准前缀](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L518-L674)

所以此处也不能许诺“本批任何一个被拒绝，所有已批准调用都不执行”。这不是说整个 Grok 所有取消路径都会如此；全局取消 token 和下层工具仍有其它约束。限定到这个局部分支，能确认的是 final_result 主要阻止后续 prepare，并没有把 approved 当作可回滚事务。

### 相同文件如何得到同一把锁

在 approved 列表上，Grok 先映射工具参数，从 `file_path`、`path`、`target_file` 中提取目标路径，结合 cwd 做词法归一化，再尽量 canonicalize 已存在祖先。这样 `a/../b`、相对路径和可解析的符号链接别名更可能落入同一锁键。[路径规范化](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_dispatch.rs#L11-L76)

随后它收集非只读项的 write_paths，只为这些路径建立 Mutex。只读调用如果指向同一写路径，也会取同一把锁；纯读取且无写者的路径不必互斥。dispatch closure 在实际 `WorkspaceOps::call_tool` 期间持有该锁。[锁表构造](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L518-L674)、[持锁调用](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L790-L849)

这比工具级共享/独占门更接近资源冲突，但仍有清楚边界：锁表是在这次 batch 内创建；没有可识别路径字段的 bash 或远端工具不在这套识别范围内；路径解析的 blocking task 失败时退化为 None 锁键并记录 warning。它不是跨会话文件锁，也不是能识别任意 shell 脚本读写集的事务管理器。

还要区分互斥与依赖顺序。Mutex 保证同锁临界区不重叠，并不单独证明模型先提出 A，就一定先完成 A 再让 B 读取。源码没有在这一处建立显式 A→B 的依赖图；对“先生成、再消费”的严格任务，分批或显式依赖仍比从锁名猜顺序可靠。

### 它没有采用 Pi / DeepSeek 的原序结果槽提交

approved 调用形成 futures 后，进入 `FuturesUnordered`；一个独立 drainer 不断取完成项，通过 channel 把 `(idx, result, duration)` 送回后处理循环。idx 用来取回对应 prepared metadata，而不是等待所有更小 idx 完成。[drainer 与接收循环](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L928-L1064)

接收循环运行 post-tool Hook 和成功/失败处理。成功路径最终通过 `handle_bridge_tool_success` 调用 `push_tool_result`，这一处也没有按模型原序重排。[成功结果入历史](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L2850-L2875)

因此，准确的结论是：**本次审读的 shell 批次路径按完成项到达的顺序进入后处理及历史写入调用**。这与 Pi/DeepSeek 的模型顺序提交有实质差别。最终 provider 序列化是否再归一化，属于后续转换层，本文没有把这一局部次序强推成所有后端的最终网络消息次序。

独立 drainer 的另一个作用，是接收循环等待某个后置 Hook 时，仍能继续轮询其它工具 body。收益是后处理不会停止这些 future 的推进；代价是使用 unbounded channel，会把压力转移为待处理结果积压。并发 body 的资源限制不能由另一处 workflow smoke-check 的 `Semaphore` 代为解释：那把信号量只限制对应检查，不是所有工具的通用并发上限。

上游 `incremental_dispatch_surfaces_fast_tool_before_slow_sibling` 测试为及时展示快工具提供了额外证据；路径别名测试补充了锁键预期。本轮只审读这些测试，未将它们列为已运行通过。[上游测试](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_tests/parallel_dispatch_tests.rs#L383-L483)

## 四种调度器面对同一批调用，会在哪里等待

| 比较维度 | Pi core | DeepSeek scheduler | Codex ToolCallRuntime | Grok shell batch |
|---|---|---|---|---|
| 前置准备 | 整批顺序 prepare 后才启动 body | 有序 prepare，但早先 body 可已运行 | readiness、准入锁与 router 管线 | 整批顺序 prepare，保存 approved |
| 并发控制单位 | 整批 parallel/sequential | 有界池 + exclusive 分组 | Runtime 共享/独占锁 | 批次内可识别文件路径锁 |
| 后置处理顺序 | 随各 body 完成 | 模型顺序 commitReady | 路由及工具生命周期内；历史另行 drain | 完成项接收顺序 |
| 历史接收顺序 | Promise.all 输入顺序 | 连续 slot 的模型顺序 | FuturesOrdered drain | 当前 shell 路径随完成项 |
| 动态变化 | 准备后持有具体工具引用 | 未启动项重查模式 | 保留宣告该工具的 step view | approved 保存准备结果，局部路径锁随后构造 |
| 一项要求结束 | 全部结果 terminate 才停止工具续轮 | 任一 committed result concludesTurn | 由模型/工具 follow-up 与外层门共同决定 | ToolLoop 分类回到会话循环 |

最后一行保留各实现自己的结束条件。它们所属层次不同，不能统一映射成同一个 `terminate` 字段。

## 实验读法：通过意味着推翻了哪些假设

2026-09-13 的补充测试包含 4 个 Pi 工具场景和 5 个 DeepSeek scheduler 场景，另有 2 个执行边界场景。它们保留门控轨迹，避免依赖“睡 10 ms 应该完成”的偶然时序。[全部新增检查](/downloads/agent-harness/04/content/evidence/deep-dive-results.json)

- Pi 的审批暂停实验推翻“第一个批准后立即执行”；单项 sequential 实验推翻“只影响该工具”；混合 terminate 实验推翻“任一项结束即停”；拒绝同伴实验推翻“整批审批自动原子化”。
- DeepSeek 的滚动池实验推翻“未提交结果仍占执行名额”；动态模式实验检验重新分类；取消与内部失败两组检验补结果策略；concludesTurn 实验区分批次结束意见和调度短路。

DeepSeek 使用原始 scheduler、原始消息构造器及常量声明，registry、policy/dispatch/finalize 与 session append 是测试服务。这证明被调用的调度代码在指定服务返回值下如何运行，不证明完整权限管线、真实存储 flush 或动态插件卸载已经通过验收。Pi 仍然使用脚本化 provider，不涉及模型能力排名。

长输出的旧实验只验证真实裁剪函数，未验证 bash/PTY 后端。这里也不把资源调度等同于进程生命周期：body 返回一个后台任务 ID，可以表示“已成功启动”，并不表示后台进程已经退出。工具超时后是否还写文件，需要在具体执行器的进程组和终止路径上单独测量。

## 我的设计判断：先选提交契约，再决定怎样并发

如果目标是可重放的研究 Harness，我倾向于 DeepSeek 这种“有界执行池 + 明确提交游标”的结构，因为状态和上下文变化能按稳定顺序解释。但我会单独输出 body-ready 事件，让界面不必等待历史提交才展示进度，并监控已完成未提交结果的大小和等待时长。

如果工具之间有已知文件冲突，可以参考 Grok 的路径识别思路，把锁放在真正共享的工作区服务层，而不是只在一个局部 batch 里创建。对于没有可声明读写集的 shell，不能声称自动依赖分析；要么按保守策略执行，要么让任务明确分阶段。

插件动态变化则需要一份更精细的契约：Schema 和参数解释绑定请求版本；可撤销权限在实际准入时重查；执行模式改变如何影响已准备未开始的调用，要写成状态迁移。这样才能同时解释 Codex 的请求快照和 DeepSeek 的启动重分类，而非选一句“用最新状态”覆盖所有需求。

最后，结果必须能表达工具未开始、body 已失败、body 成功但后处理失败、取消后结果未知等不同事实。调度器如果只产出一个布尔 success，下一次模型重试会把语义差异全部抹掉。把这些状态保留下来，才是后面权限、恢复与可观测性几篇能继续推理的基础。

<!-- harness-diagram:04-summary -->

<figure class="article-figure"><a href="/images/agent-harness/04/04-summary.svg" target="_blank" rel="noopener" aria-label="查看完整配图：并发至少有准备、执行、提交三种顺序"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/04/04-summary-mobile.svg"><img src="/images/agent-harness/04/04-summary.svg" alt="并发至少有准备、执行、提交三种顺序" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 04 · 本篇总结：快工具已经 ready，不代表结果已经提交；互斥也不自动建立业务依赖。*

图示依据：[C04](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/parallel.rs#L42-L250)、[P04](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L409-L550)、[D04b](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/tool-calls.ts#L130-L290)、[G04d](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/tool_calls.rs#L928-L1064)。跨实现比较 · 根据本篇已引源码与明确的实验范围。

<!-- /harness-diagram -->

## 配套材料

[阅读实验说明](/agent-harness/04-evidence/) · [阅读复现入口](/agent-harness/04-reproduce/) · [下载正文、原图与实验材料](/downloads/agent-harness/04/agent-harness-04.zip)（[SHA-256](/downloads/agent-harness/04/agent-harness-04.zip.sha256)）。

下载包保留本篇最终正文、6 张原图、固定版本记录及实验源码；不含上游源码或依赖。复现实验需要联网准备环境，既有实验边界见说明。

<!-- harness-series-nav -->

## 系列阅读

[上一篇：上下文压缩如何保持一致？切点、替换与请求重建](/agent-harness/03-context/) · [下一篇：一次批准改变了什么？四种 Harness 的权限与沙箱](/agent-harness/05-permissions/)

<!-- /harness-series-nav -->
