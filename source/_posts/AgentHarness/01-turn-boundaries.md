---
title: "Agent 的一轮何时结束？四种 Harness 的执行边界"
description: "一条用户请求可能跨过多次模型调用。沿四种 Harness 的退出、追加输入与取消路径，区分模型结束、运行结束和资源收尾，解释为何出现最终文本后任务仍会继续。"
intro: "模型已经返回总结，任务为什么还没结束？从输入队列、停止门和取消后的收尾入手，比较四套固定源码怎样决定一轮执行的边界。"
kind: article
card_wrap: words
published: true
categories: [Agent Harness]
tags: ["Agent Harness", "源码阅读", "Coding Agent"]
date: 2026-09-14
updated: 2026-09-14
permalink: agent-harness/01-turn-boundaries/
related: ["agent-harness/00-overview/", "agent-harness/02-model-streams/"]
---

<figure class="article-figure"><a href="/images/agent-harness/01/01.svg" target="_blank" rel="noopener" aria-label="查看完整配图：一轮何时结束：模型结束、循环结束、资源结算是不同边界"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/01/01-mobile.svg"><img src="/images/agent-harness/01/01.svg" alt="一轮何时结束：模型结束、循环结束、资源结算是不同边界" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

用户说“修改实现并运行测试”。模型调用一次编辑工具，再调用一次测试工具，最后输出总结。用户只发了一条请求，系统却经历了三次模型响应。此时用户又补充“先别结束，把失败原因解释清楚”，运行时应该把这句话塞到哪里？如果同时按下停止，是丢弃这句话、继续当前请求，还是结束旧执行后另开一轮？

要解释这些行为，需要找到三个具体的控制位置：**谁拥有正在运行的活动，哪里接纳新工作，哪个条件有权结束活动。** 一个实现可以完全没有丢消息，却把消息安排在不符合用户意图的边界；也可以正确发出取消信号，却错误地把资源尚未收尾显示成“已停止”。

本文沿用[四个固定提交](/downloads/agent-harness/01/content/evidence/versions.json)，不随着远端 HEAD 漂移。下面的伪代码是对原始分支的语义压缩，不是可直接运行的上游代码。本篇有关循环边界的运行观察来自原始 Pi core 与脚本化模型响应；其它项目的结论限定在所引源码路径，不能由 Pi 的实验代为验证。

> 版本与证据：源码基线固定于 2026-09-12，实验记录来自 2026-09-12 至 13 日；本文于 2026-09-14 润色，未重新执行实验。源码事实、局部实验观察与设计判断分别表述，不代表四产品端到端验收。详见[本篇实验说明](/agent-harness/01-evidence/)。


## 先把“结束”拆成可以检查的承诺

这里用 R 表示用户请求，M 表示一次模型响应，B 表示响应带来的工具批次，A 表示运行时占有的活动。最普通的轨迹是：

```text
R1 被接纳
  M1 → B1：编辑
  M2 → B2：测试
  M3 → 无工具：总结
  评估结束条件
  发出终止事件
  等待订阅者与清理
A1 释放，允许下一项工作进入
```

这个图还没有画出新输入和扩展。加上它们，“模型没有再请求工具”最多证明 M3 不欠工具结果，并不证明运行时没有欠下其它工作。

为了精确比较，可以把状态写成五元组 `S=(owner, phase, pending, continuation, settlement)`。owner 是活动所有者；phase 是当前阶段；pending 是待接纳输入；continuation 表示工具或停止门是否要求继续；settlement 是仍需等待的回调、存储和资源。这是本文的分析记号，并非四个仓库共享的类型。

读源码时，至少检查下面三种不变量：

- **单一所有者。** 同一个会话不能因为两次唤醒同时创建两个修改历史的驱动器。
- **输入归属明确。** 已取消活动不能再次接纳本应启动新工作的输入；反过来，新活动也不应误拿旧活动的取消信号。
- **结束承诺分层。** 无更多模型工作、已发终止事件、外部资源停止、历史持久化，是不同事实；一个事件只承担实现实际提供的承诺。

这些不变量比“有 while 循环”“支持 interrupt”更能解释实现差异。下面分别追到各项目真正改变这些状态的分支。

## Pi：两层循环分别回答两类“还要继续吗”

### 从公共入口追到内外循环

<!-- harness-diagram:01-pi -->

<figure class="article-figure"><a href="/images/agent-harness/01/01-pi.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Pi：停止检查优先于 follow-up 轮询"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/01/01-pi-mobile.svg"><img src="/images/agent-harness/01/01-pi.svg" alt="Pi：停止检查优先于 follow-up 轮询" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 01 · Pi：实测停止条件成立时，follow-up 回调调用次数为 0。*

图示依据：[P01](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L156-L277)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

调用链是 `Agent.prompt()` → `runWithLifecycle()` → `runAgentLoop()` → `runLoop()`。`Agent` 对象拥有 `activeRun` 和 AbortController，loop 接收上下文、模型配置、事件 sink 及输入队列回调。两者职责不同：loop 决定下一次采样，Agent 决定这个 run 何时释放。[生命周期实现](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent.ts#L486-L592)、[循环主体](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L156-L277)

保留判断顺序后，`runLoop` 可以压缩为：

```text
pending = pollSteering()
repeat:
  hasMoreToolCalls = true
  while hasMoreToolCalls or pending 非空:
    如果已完成过 turn:
      prepareNextTurn(上次结果)
      若 pending 为空，再 pollSteering()
      emit turn_start
    接纳 pending
    M = streamAssistantResponse()
    若 M 为 error / aborted：emit turn_end、agent_end；return
    若 M 带工具：执行或拒绝批次，并记录结果
    hasMoreToolCalls = 存在工具批次 且 批次未要求终止
    emit turn_end
    若 shouldStopAfterTurn(...)：emit agent_end；return
    pending = pollSteering()
  pending = pollFollowUp()
  若 pending 为空：break
emit agent_end
```

内层处理的是正在进行的自动工作，包括工具结果引出的下一次采样和 steering。外层只在内层原本会停止时接纳 follow-up。把两个队列合成一个先进先出队列，会丢失“影响当前工作”与“等当前工作结束后再做”的区别。

### `prepareNextTurn` 后为什么还要读一次 steering

准备下一轮可能包含压缩，耗时明显长于普通内存操作。第一次 poll 为空以后，用户可能在准备期间输入一条消息。源码在准备结束后再次轮询，避免这条消息额外延后一轮；但它仅在 `pendingMessages.length === 0` 时重读。

这个条件保留了 one-at-a-time 队列的语义：如果第一次已经拿到一条消息，再读一次就可能在同一 turn 注入两条。这次补读同时照顾输入的及时性和每轮消费数量，条件本身决定了队列契约。[准备与重读位置](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L156-L277)

补充实验 `01-steer-during-prepare` 在 `prepareNextTurn` 内放入消息，实际捕获第二次 provider 输入，确认它已经包含该消息。实验没有让模型自己“意识到”用户改口，测的是输入接纳位置。[结果与轨迹](/downloads/agent-harness/01/content/evidence/deep-dive-results.json)、[测试源码](/downloads/agent-harness/01/content/experiments/deep-dive-lab.ts)

### `shouldStopAfterTurn` 的优先级高于队列

这个 Hook 在 `turn_end` 之后、下一次 steering/follow-up 查询之前执行。一旦返回真，loop 直接 return，不会因为队列还可能有消息而留在本次 run 中。

这适合做边界暂停：让已经启动的模型响应和工具批次完成，然后把控制交还宿主。但它不是“立即取消”。测试 `01-stop-before-followup-poll` 给第一次响应安排一个工具，Hook 返回真，观察到工具已经完成、模型只调用一次、follow-up 回调调用次数为 0。是否把未消费消息留给下一次 run，是宿主队列和启动策略的责任，不能从 loop 的 return 推出“消息已丢弃”。

还有一个细节：工具返回 `terminate` 只影响工具驱动的自动续轮。该批所有已收集结果都要求 terminate 才会置位；随后如果又取到 steering，内层仍能继续。相反，`shouldStopAfterTurn` 的直接 return 是更强的当前 run 退出条件。第 04 篇将拆解这个聚合规则。

### `agent_end` 为什么不是 `prompt()` 返回的同义词

`processEvents` 先更新 Agent 内部状态，再等待订阅者。`runWithLifecycle` 直到 executor 结束才在 finally 调用 `finishRun()`，后者清理 `activeRun` 并结算 idle promise。[原始实现](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent.ts#L486-L592)

因此，下面这条循环等待链是真实的接口风险：

```text
prompt 等待 loop
loop 等待 agent_end 的异步订阅者
订阅者如果 await 同一 Agent.waitForIdle()
waitForIdle 等待 finishRun，而 finishRun 在 loop 返回以后
```

这是按 await 依赖推导的循环等待风险，不是本轮故意把进程挂死后的运行结论。已运行的实验采用可释放同步门，证明只要 `agent_end` 订阅者未完成，`prompt()` 就尚未结算。[原有实验](/downloads/agent-harness/01/content/experiments/pi-lab.ts)

把日志上传放进 awaited listener，会让网络延迟成为 run 的完成延迟；把它改为不等待，又需要外部队列处理丢失、积压和关闭。选择是否等待回调，同时也在选择延迟由谁承担、失败由谁处理，以及关闭时由谁收尾。

## Codex：先判断是否欠工作，再让停止门审查退出

### 不能在 `needs_follow_up` 那一行停止阅读

<!-- harness-diagram:01-codex -->

<figure class="article-figure"><a href="/images/agent-harness/01/01-codex.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Codex：无新工具，不一定可以退出"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/01/01-codex-mobile.svg"><img src="/images/agent-harness/01/01-codex.svg" alt="Codex：无新工具，不一定可以退出" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 01 · Codex：“停止”要结合欠工作和停止门判断，不能只读取模型 stop 字段。*

图示依据：[C01c](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/turn.rs#L580-L710)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

Codex 的采样循环在 `run_turn` 中。构造请求前，根据已有视图与输入状态复用或捕获 `StepContext`，历史投影、工具宣告和后续工具执行共享这份请求视图。`run_sampling_request` 返回后，loop 取得 `model_needs_follow_up`，收取异步 Hook 结果，再查询输入队列。[请求与结果连接](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/turn.rs#L423-L580)

第一层继续条件确实可以写成：

```text
needs_follow_up = model_needs_follow_up OR has_pending_input
```

但这不是完整退出条件。紧接着代码会考虑上下文窗口滚动；只有 `!needs_follow_up` 时，才进入 `run_turn_stop_hooks`。Stop Hook 的 block 若带有可构造的 continuation fragments，运行时把反馈记录进历史并 `continue`；如果要求 block 却没有可用提示，代码发出 Warning，而不是凭空继续空转。`should_stop` 则可以 break，后面还有 legacy after-agent Hook 路径。[完整退出审查](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/turn.rs#L580-L710)

可以把这部分理解为两阶段决策：采样结果和队列决定“仍有必须处理的工作吗”，停止门决定“这次完成是否被接受”。从设计上看，前者表示仍有工作，后者允许完成检查或策略要求继续。把两者都叫 follow-up，会看不出谁有权延长执行、谁应承担额外成本。

### 压缩后的输入排空不是无条件打开

当仍需继续且达到窗口条件，代码调用 `run_auto_compact`，成功后设置 `can_drain_pending_input = !model_needs_follow_up` 再回到循环。下一次是否排空队列，因而仍然受前次采样是否需要继续影响。[窗口分支](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/turn.rs#L580-L710)

可以直接确认的是：这不是每次循环顶部都无条件消费输入的结构。我的解释是，这种显式门控有利于保留模型续接与新输入之间的边界；但仅凭这一赋值还不能完整断言所有 mailbox 输入的公平性。那需要继续审查 `input_queue` 的接受与唤醒规则。本文不把局部分支推成全局调度保证。

### 取消时，为什么要先让任务看到取消，再清审批

`abort_all_tasks` 取得活动任务后，先进入 `handle_task_abort`。后者发出 cancellation token，等待任务完成通知或 100 ms 的宽限期，随后 abort handle，并调用任务类型自己的 `abort`。在适用配置下，它还记录中断标记并尝试 flush，最后运行 interrupt Hooks。[取消主体](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tasks/mod.rs#L878-L947)

这里的 [100 ms 常量](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tasks/mod.rs#L65-L71) 是**等待合作退出的一个局部宽限常量**，不是“所有命令都在 100 ms 内停止”的服务承诺。后续清理可能继续 await；底层进程和远端请求是否真正终止，要看相应资源所有者。

回到外层，代码发出 abort lifecycle 后才清理 pending approvals。源码注释点明理由：如果先释放审批等待，任务可能把通道关闭解释成模型可见的拒绝，赶在 `TurnAborted` 之前落入错误分支。[审批清理次序](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tasks/mod.rs#L512-L550)

所以清理顺序也在定义语义。对于一个等待审批的工具，“用户拒绝”“整个 turn 取消”“审批通道异常关闭”可能最终都使它不能执行，但后续模型是否重试、客户端显示什么、恢复时如何解释，完全不同。泛泛地写“支持 cancellation token”会遗漏这层协议一致性。

另一个边界是 flush 失败：这里记录警告，并不把每一次中断通知都变成“中断标记已经成功落盘”的绝对证明。要解释真实崩溃窗口，需要连同第 06 篇的存储链阅读。

## DeepSeek：唤醒与取消交错时，谁接管新输入

### phase 如何约束活动的所有权

<!-- harness-diagram:01-deepseek -->

<figure class="article-figure"><a href="/images/agent-harness/01/01-deepseek.svg" target="_blank" rel="noopener" aria-label="查看完整配图：DeepSeek：取消与唤醒交错时，谁接管输入"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/01/01-deepseek-mobile.svg"><img src="/images/agent-harness/01/01-deepseek.svg" alt="DeepSeek：取消与唤醒交错时，谁接管输入" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 01 · DeepSeek：先记录取消后的唤醒状态，再通知观察者，避免重入把归属弄乱。*

图示依据：[D01b](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/agent.ts#L125-L250)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

`Agent` 用 `idle`、`running`、`maintenance` 表示活动占有。`wakeDriver()` 在 idle 时预留 running phase 并创建 driver promise；已有活动时不再启动第二个 driver。`kick()` 反复执行 turn，在 finally 收敛回 idle，必要时重放唤醒。[驱动器与输入入口](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/agent.ts#L125-L250)

与 Pi 把队列读取函数传进循环不同，这里 Agent 自身拥有 inbox 与唤醒状态。它不仅决定消息何时进入模型，也决定有没有一个执行者负责消费消息。这多出一层状态，却能直接表达“维护期间来了新任务”和“旧活动取消后来了新任务”。

看下面这次交错：

```text
旧 driver 正在运行
cancel → 旧 AbortController 已 aborted
新 followup/steer 到达
send 发现 wakingAfterAbort → 强制归 next-turn
wakeDriver 不另起并发 driver，而是记 wakeRequested
旧 driver finally → idle
若队列仍非空 → 新 driver + 新 AbortController
```

`wakingAfterAbort` 在插入 inbox 前计算。源码特别防备一种重入：inbox splice 的观察者可能同步调用 cancel。如果分类发生在插入之后，同一条输入可能被观察者改变归属。[send 与 latch](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/agent.ts#L125-L250)

这个细节体现的是状态机的一致性：消息归属应由接纳时的边界确定，不能在通知副作用之后再次解释。它不要求多线程；JavaScript 的同步观察者和 await 就足以制造需要处理的交错。

### `whenIdle()` 为什么不是只 await 一次

`whenIdle()` 保存当前 `activityDone`，等待它，再比较等待的 promise 是否仍是最新活动；若已经换成新 driver 的 promise，继续等。旧 driver 结束时可能顺手启动新 driver，因此“刚才那个活动结束”不等于“此 Agent 已无活动”。[等待实现](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/agent.ts#L125-L250)

这种等待语义偏向排空连续唤醒的工作。如果有源源不断的新工作，它也可能持续等待。需要等待“我提交的那一项工作”时，调用方应使用对应 turn 的身份和结果，不能把整体 idle 当作请求级 future。

### 为什么 turn 可以零 step，以及为什么结束原因有优先级

`turn()` 先 append `turn/start`，然后 claim 输入并执行 `preStep`。若 pre-step 拒绝，则 reason 是 blocked；若首份输入被改为空，则可以 completed 而没有任何 `step/start`。这使运行时接纳与模型消费成为两个不同的记录边界。[turn 状态机](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/agent.ts#L266-L350)

step 的返回值也不是单一布尔：无工具可返回 completed，工具还欠后续工作时返回 null，达到输出上限返回 max-tokens。源码对 max-tokens 做了 sticky 处理：后续正常 step 不能把这个历史事实降格成普通 completed。下一 step 的输入或 `agent/turn-stopping` 回调可能仍加入工作，但最终原因必须保留此前出现过的限制。

取消是另一条路径。`cancel` 默认清 inbox，`keepInbox` 可保留；异常处理中若 signal 已取消，就以 aborted 原因收束。finally 写 step/end、turn/end，只说明可执行到 finally 的失败路径有收尾逻辑，不能覆盖 SIGKILL 或机器断电。

## Grok Build：conversation loop 外面还有 goal 与 stop gate

### 找到最外层之前，不能说“这个函数返回就结束”

<!-- harness-diagram:01-grok -->

<figure class="article-figure"><a href="/images/agent-harness/01/01-grok.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Grok：conversation 外还有继续工作的条件"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/01/01-grok-mobile.svg"><img src="/images/agent-harness/01/01-grok.svg" alt="Grok：conversation 外还有继续工作的条件" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 01 · Grok Build：Cancelled / MaxTurnsReached 的处理，不能推广到所有结束原因。*

图示依据：[G01c](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L1250-L1400)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

`process_conversation_turn` 包装 inner 并结算延迟，inner 执行采样与工具循环。在工具返回后，`ToolLoop` 可以带回 PermissionReject、Cancelled、FollowupMessage 等结果；最大工具轮数也会产生 `MaxTurnsReached`。这让错误原因进入会话控制，而不只是塞给模型一段字符串。[内部工具循环出口](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L3600-L3690)

但 conversation turn 的 Completed 还要回到外面的 prompt 驱动逻辑。该层有 goal continuation 和 `run_stop_gate`：需要继续 goal 时注入 continuation；StopGateDecision 为 KeepWorking 时注入反馈再跑一轮。队列中的用户 prompt 和 synthetic continuation 也影响是否继续当前 goal round。[外层驱动](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L1250-L1400)

因此，Grok 至少要区分“一个 sampler 响应结束”“一次 conversation round 返回”和“外层 prompt 获准停止”。只读 `process_conversation_turn_inner` 中第一个 Completed 就总结最大生命周期，会漏掉真正拥有最终控制权的外层。

### 精细内部结果如何投影到较粗协议

结束处理中，Cancelled 与 MaxTurnsReached 会触发 `cancel_running_turn_subagents`。随后代码执行会话 flush、工作区 rewind 信息收尾，再映射对外结果。内部保留的 `PromptCompletionKind` 能区分这些状态，而 ACP StopReason 对两者都可能使用 Cancelled。[清理入口](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L1250-L1400)、[结果映射](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L1455-L1698)

这不是增加状态数量就能解决的问题，不同记录需要回答不同问题：客户端可能只需让停止按钮恢复，遥测需要知道是预算耗尽还是用户取消，恢复机制还需要判断哪些任务需要后续处理。若只保存协议中最粗的状态，后面的归因就无从恢复。

这里需要限定到实际分支：本文引用的取消调用只对 Cancelled 和 MaxTurnsReached 触发，不能推广到所有正常完成路径，更不能据一个函数调用认定所有子进程已经回收。

## 把四种结构放进同一组交错场景

| 场景 | Pi core | Codex core | DeepSeek default loop | Grok shell |
|---|---|---|---|---|
| 模型输出最终文本后又有工作 | steering / follow-up 按内外循环接纳 | 查 pending，再经 Stop Hooks | next-step inbox 与 turn-stopping 可续接 | 外层 goal / stop gate 可再次驱动 |
| 当前边界结束优先于队列 | shouldStopAfterTurn 直接 return | Stop 分支需结合既有 follow-up 判断 | pre-step reject / abort 等结构化出口 | TurnOutcome 先回到外层策略 |
| 取消后紧接着新输入 | 依赖宿主队列与下一 run 的安排 | abort 生命周期后可能启动 pending work | wakingAfterAbort + wakeRequested 显式衔接 | 需结合 prompt 队列与 goal 驱动解释 |
| “没有事件了”与“可接下一项” | awaited listener 后 finishRun | 任务与中断清理仍有独立阶段 | whenIdle 跟随 activityDone 更换 | 还有会话/工作区结算与协议映射 |

表中没有性能排名。Pi 的机制较适合让嵌入方直接控制队列和边界；DeepSeek 把更多接纳与唤醒责任收进 Agent；Codex 与 Grok 的产品层在循环外保留审批、停止门和其它会话责任。这个适用性判断来自责任分配，不是项目作者的未公开设计动机。

## 实验怎样约束本文结论

已有实验让一条请求经历两批工具，记录 **3 个 turn_end、1 个 agent_end**；在 preflight、合作式工具、不合作工具三个位置发出取消，副作用分别为 0、0、1。同步门实验进一步确认终止订阅者仍会阻止 prompt 结算。[原始结果](/downloads/agent-harness/01/content/evidence/pi-lab-results.json)

2026-09-13 补充两个直接针对退出条件的实验：边界停止后 follow-up poll 为 0；准备过程中到达的 steering 出现在第二次请求。它们能分别区分“先排空再停止”和“停止优先”、以及“只在准备前轮询”和“准备后补读”。因此，这些受控时序能够区分两种实现假设，为上述边界提供可检查的依据。[新增结果](/downloads/agent-harness/01/content/evidence/deep-dive-results.json)

未完成的是 Codex/Grok 整机取消时延、DeepSeek 实际 provider 的 phase 交错和四套客户端的按钮反馈。上文对这些路径的结论限定为源码控制流，不把 100 ms 常量、finally 或 cancel 函数名当成验收结果。

## 我会怎样设计这一层

我会把一次用户提交的身份、驱动器活动身份和模型尝试身份分开保存。停止操作至少返回“已接受取消”，终止记录再给出最终原因；资源是否全部收敛与结果是否持久化保留独立证据。

队列也应有语义类型，而不只是一串字符串。影响当前工作的 steering 必须在明确的模型边界消费；排队请求应有自己的完成身份。还需要写清竞争时的优先级：取消、准备、输入接纳和结束 Hook 交错时，由哪个快照决定归属。

最后，我不会把所有扩展都放进同一套 awaited callback。改变控制决策或提交结果的扩展需要成为因果链的一部分；只做遥测导出的扩展则可以使用有界队列和明确的关闭策略。把这两种责任区分开，才有机会解释“模型已经说完，为何任务还没结束”，并在不破坏一致性的前提下改善响应性。

<!-- harness-diagram:01-summary -->

<figure class="article-figure"><a href="/images/agent-harness/01/01-summary.svg" target="_blank" rel="noopener" aria-label="查看完整配图：不要把四种 turn 当作同一统计单位"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/01/01-summary-mobile.svg"><img src="/images/agent-harness/01/01-summary.svg" alt="不要把四种 turn 当作同一统计单位" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 01 · 本篇总结：结束标志只属于它所在的一层；继续条件与资源结算还要分别追。*

图示依据：[C01c](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/turn.rs#L580-L710)、[P01](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L156-L277)、[D01b](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/agent.ts#L125-L250)、[G01c](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L1250-L1400)。跨实现比较 · 根据本篇已引源码与明确的实验范围。

<!-- /harness-diagram -->

## 配套材料

[阅读实验说明](/agent-harness/01-evidence/) · [阅读复现入口](/agent-harness/01-reproduce/) · [下载正文、原图与实验材料](/downloads/agent-harness/01/agent-harness-01.zip)（[SHA-256](/downloads/agent-harness/01/agent-harness-01.zip.sha256)）。

下载包保留本篇最终正文、6 张原图、固定版本记录及实验源码；不含上游源码或依赖。复现实验需要联网准备环境，既有实验边界见说明。







<!-- harness-series-nav -->

## 系列阅读

[上一篇：一次 Agent 任务经过哪些层？从四种 Harness 看责任边界](/agent-harness/00-overview/) · [下一篇：模型流何时可以执行工具？四种 Harness 的终态与重试](/agent-harness/02-model-streams/)

<!-- /harness-series-nav -->
