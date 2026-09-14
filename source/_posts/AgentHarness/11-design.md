---
title: "从四种 Harness 到自己的设计：用离线查看器检验取舍"
description: "如何把源码差异转成自己的设计，而不是再列一份功能清单？围绕事件关系、取消、持久化和扩展组合提出取舍，再用已交付的 Pi 离线轨迹查看器核对实现与建议的边界。"
intro: "系列最后回到一个可检查的原型：它保存哪些事实，哪些关系不能推断，哪些能力仍未实现。通过离线查看器审计，把四种 Harness 的经验落实为有来源、有代价的设计决定。"
kind: article
card_wrap: words
card_title_lines: ["从四种 Harness 到自己的设计：", "用离线查看器检验取舍"]
published: true
categories: [Agent Harness]
tags: ["Agent Harness", "源码阅读", "Coding Agent"]
date: 2026-09-14
updated: 2026-09-14
permalink: agent-harness/11-design/
related: ["agent-harness/10-observability/"]
---

<figure class="article-figure"><a href="/images/agent-harness/11/11.svg" target="_blank" rel="noopener" aria-label="查看完整配图：自己的设计与原型：先解决可解释的窄问题"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/11/11-mobile.svg"><img src="/images/agent-harness/11/11.svg" alt="自己的设计与原型：先解决可解释的窄问题" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

读完系列后，还需要把“模型、工具、持久化、子 Agent、可观测性”等功能名，转成可以预测行为的设计约束。一个功能名容纳不了前文的分歧：Hook 可以并发改写、顺序检查同一原输入，也可以组成逐级变换；取消可以只是本地拒绝等待，也可以等待子进程真正退出。这些差异会直接改变接口的契约。

本篇先说明我会保留哪些约束、放弃哪些统一，再审计实际交付的[离线轨迹查看器](/agent-harness/11-viewer/)。设计判断与已实现功能分别标明。这里没有开发新的完整 Harness，没有四产品兼容层，也没有把真实模型评测说成已完成。

> 版本与证据：源码基线固定于 2026-09-12，实验记录来自 2026-09-12 至 13 日；本文于 2026-09-14 润色，历史机制实验未重跑，仅复跑查看器的 9 项自动检查。源码事实、局部实验观察与设计判断分别表述，不代表四产品端到端验收。详见[本篇实验说明](/agent-harness/11-evidence/)。


## 一、先确定责任怎样交接

前面的文章反复出现六个位置：请求被接纳、运行被准入、外部动作发生、结果可用、结果被记录、观察者消费。它们之间存在顺序约束，但不是一个全局事务。Codex 子线程已经注册后，首条消息投递仍可能失败；DeepSeek 子任务结果已经完成，dispose 错误仍能让 job 结算失败；Grok 未完成 promotion 的子线程若尚未退出，会保留工作区资源。[注册后投递](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/agent/control/spawn.rs#L723-L810) [结果和清理](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent/src/run-settlement.ts#L28-L75) [资源保留](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/mod.rs#L1908-L1958)

<!-- harness-diagram:11-grok -->

<figure class="article-figure"><a href="/images/agent-harness/11/11-grok.svg" target="_blank" rel="noopener" aria-label="查看完整配图：设计启发 · Grok：删除资源要晚于退出确认"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/11/11-grok-mobile.svg"><img src="/images/agent-harness/11/11-grok.svg" alt="设计启发 · Grok：删除资源要晚于退出确认" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 11 · Grok Build：设计建议：结果、记录和资源分别有状态；未知不能显示成已回收。*

图示依据：[G08d](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/mod.rs#L1908-L1958)。固定源码启发 → 本文设计建议。

<!-- /harness-diagram -->

所以我不会先定义一个从 Running 走到 Completed 的通用枚举，然后把所有事件塞进去。一个工具调用至少同时有执行、记录、资源三种状态；一个客户端还多一层观察进度。它们相互关联，却应允许出现“结果已知、记录待写、资源待回收”。隐藏这种组合，只会把真实故障推到 UI 文案里。

这是设计约束，并未在当前查看器中实现完整状态机。原型保存观察点，下一步只有在来源提供足够证据时才派生状态。

## 二、决定一：保留原生事实，用有来源的关系连接它们

Codex reducer 给出了比统一 event.type 更有价值的结构：runtime code cell 可先发生，模型可见源项稍后出现；关系暂存直到证据齐备。它也通过 previous_response_id 重建省略的上下文，缺失前驱时拒绝伪造完整输入。[暂存关系](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/code_cell.rs#L80-L129) [前驱重建](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/conversation.rs#L19-L110)

<!-- harness-diagram:11-codex -->

<figure class="article-figure"><a href="/images/agent-harness/11/11-codex.svg" target="_blank" rel="noopener" aria-label="查看完整配图：设计启发 · Codex：证据与解释分开保存"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/11/11-codex-mobile.svg"><img src="/images/agent-harness/11/11-codex.svg" alt="设计启发 · Codex：证据与解释分开保存" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 11 · Codex：设计建议：保留关联依据；证据未齐时显示待关联，不能伪造因果。*

图示依据：[C10f](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/code_cell.rs#L80-L129)、[C10e](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/conversation.rs#L19-L110)。固定源码启发 → 本文设计建议。

<!-- /harness-diagram -->

Pi 的实例则说明为什么需要多个“结束”：工具执行结束和 toolResult 消息结束是不同事件，并行完成序与结果进入历史的顺序不同。把它们都叫 tool.completed，就丢掉了判断“工具慢”还是“提交在等前面的结果”的能力。[并发处理](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L409-L550)

因此未来适配器若有共同 envelope，我会只统一来源、原生身份、观察顺序、原始 payload 引用和采集范围；语义关系另存并带生成依据。比如“来自同一个 call ID”可以作为关联依据，但“第一个 start 与第二个 end 是同一次 attempt”没有额外身份就不能默认成立。相同 call ID 若被恢复过程复用，覆盖前一条反而会抹掉最有价值的异常。

代价是跨产品图表不会立即整齐。收益是遇到未知事件类型时仍可读原始证据，无需为适配图表丢弃原始字段。推翻这个选择的条件也明确：如果上游提供稳定、完整的对象与 attempt 身份，就采用它，减少本地猜测；不能反过来要求上游事实服从自造状态机。

## 三、决定二：取消报告使用阶段，不用一个布尔值代表所有权收回

09 篇实测 DeepSeek transport abandonment：客户端等待拒绝之后，服务端仍继续执行。08 篇实测 Pi 示例：发送 SIGTERM 后 `proc.killed` 为真，进程仍活着，原函数的备用强杀条件因为这个标志没有成立，实验随后主动强杀并等待退出。两例都提醒我们，取消信号是动作，不是完成证明。[客户端取消位置](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/protocol/src/transport.ts#L66-L267) [子 Agent 实验](/downloads/agent-harness/11/content/evidence/subagent-results.json)

<!-- harness-diagram:11-pi -->

<figure class="article-figure"><a href="/images/agent-harness/11/11-pi.svg" target="_blank" rel="noopener" aria-label="查看完整配图：设计启发 · Pi：别用一个 cancelled 表示全部结束"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/11/11-pi-mobile.svg"><img src="/images/agent-harness/11/11-pi.svg" alt="设计启发 · Pi：别用一个 cancelled 表示全部结束" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 11 · Pi：当前查看器只显示观察点；分阶段取消是后续运行接口的建议。*

图示依据：[P08e](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L397-L439)、[P06i](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L515-L545)。源码与取消反例 → 本文设计建议。

<!-- /harness-diagram -->

未来运行接口应至少让调用者区分取消已请求、停止接纳新工作、正在执行的部分已结算、拥有的资源已退出。可以有统一入口，但返回内容必须说明达到哪个阶段、尚有哪些句柄和哪些结果未知。对于持有工作区的子进程，只有拥有它的管理者能决定何时删除资源；Grok 的保留策略恰好说明“清理失败就先删目录”不是更彻底的取消。[未退出时保留资源](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/mod.rs#L1908-L1958)

这不是给所有对象强加“取消后必须等一切”的要求。用户停止观察可以立即生效，断连也可以只撤销连接资源。关键是 范围明确：停止等待一个请求和终止整个任务树，名称、授权和结果不能混用。这个决定会让接口返回更复杂，却减少需要人工猜测的错误状态。

当前查看器不发送取消、不管理进程，只显示已观察事件。取消阶段模型是后续运行组件的设计要求，不是已交付控制功能。

## 四、决定三：按事实类型定义持久化承诺

06 篇已经区分会话历史重建、工具副作用重放和工作区 rewind。Codex 恢复需要选择存活 checkpoint，再应用 suffix；Pi durable 工具恢复要求旧记录与当前工具声明都允许 safe replay，且不能把已取消调用当作可重放；DeepSeek JSONL 的实时事件队列与显式持久写入也不是同一条路径。[存活历史](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/rollout_reconstruction.rs#L330-L420) [双 safe 条件](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/runtime/drive/tools.ts#L515-L545) [队列与写入](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts#L267-L371)

<!-- harness-diagram:11-deepseek -->

<figure class="article-figure"><a href="/images/agent-harness/11/11-deepseek.svg" target="_blank" rel="noopener" aria-label="查看完整配图：设计启发 · DeepSeek：不要提供万能 save"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/11/11-deepseek-mobile.svg"><img src="/images/agent-harness/11/11-deepseek.svg" alt="设计启发 · DeepSeek：不要提供万能 save" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 11 · DeepSeek：设计建议：业务持久性与观测 handoff 使用不同承诺。*

图示依据：[D06d](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts#L267-L371)、[D10e](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry/src/coordinator.ts#L143-L250)。固定源码启发 → 本文设计建议。

<!-- /harness-diagram -->

我会让最小运行组件分别报告“结果进入内存历史”“后端接受持久写入”“后端要求的 flush 已完成”。外部动作是否已经生效则由工具协议和环境提供证据。若工具调用远程服务，只有该服务的幂等或事务能力能关闭某些重复执行窗口；一个本地操作 ID 不能凭空让远端支持去重。

操作未知时的默认选择也必须写清。对于不可安全重放的工具，我会保留未知结果并要求进一步核实；对已声明可安全重放的工具，仍需检查当前版本声明和旧执行记录是否一致。代价是恢复不总能自动继续，但这是保留事实的不确定性，而不是把“没看到结果”变成“没发生副作用”。

观测日志则使用更弱的承诺。DeepSeek handoff cursor 可以越过失败记录；Codex 诊断写入失败不阻塞用户会话。不能把这种 best-effort 通路拿去支撑业务 exactly-once，再用“都是日志”解释混用。[交接游标](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry/src/coordinator.ts#L143-L250) [诊断 writer](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/writer.rs#L85-L159)

## 五、决定四：扩展接口规定组合律，运行时负责等待已持有资源

07 篇里最有设计意义的差别不是有没有插件，而是两个插件都返回修改时如何合成。Pi durable HookRegistry 做 waterfall，Codex 同步 Hook 并发且按完成顺序选择改写，Grok 顺序检查原输入并在拒绝时短路。给三者统一成 `onBeforeTool`，只统一了名字，没统一行为。

我的选择是把接口拆成两类：变换链显式传递上一步结果；观察通知声明是否等待、错误是否传播、是否可以影响执行。对于授权门，参与决策的输入必须和执行参数建立明确关系：Pi 参数准备在前置 Hook 之前，说明审批原始 JSON 与审批最终参数是两个不同问题。[准备与 Hook](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L607-L714)

生命周期也不能只规定“插件返回 disposer”。Cordis 先登记清理，再等待 setup；同一 effect 内反向执行清理，不同 effect 的卸载又可能并发。一个内部清理抛错可能让同 effect 后续清理不再执行，而外层仍继续其他 effect。设计接口时必须明确这种失败传播，否则调用者会误以为 dispose resolve/reject 代表所有资源已释放。[Cordis 卸载边界](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L675-L709)

需要固定视图的执行阶段，我会优先使用快照或代际身份：一次模型请求展示的工具集合要能解释后续路由使用了哪个版本；异步 setup 完成后也要检查当前 provider 是否仍是发起时那一代。快照提高可解释性，代价是热变更不会无条件立即影响在途操作。这是从 Codex step 视图和 Cordis 生命周期共同得到的约束，不能简单选“全静态”或“全动态”。[工具请求视图](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/parallel.rs#L42-L250)

## 六、原型审计：查看器目前能解释什么

当前原型处理的是实验 envelope：scenario、seq 和 Pi 原始 raw 事件。Python 校验每个场景序号严格递增、raw 是对象、type 是字符串；没有校验所有来源字段、序号连续性或 Pi 的完整事件 schema。它接受未知字段，不等于支持未知协议。数据是构建时嵌入 HTML，页面没有运行时文件导入或实时订阅功能。[生成器](/downloads/agent-harness/11/content/experiments/trace_viewer.py)

当前工具表保留同一 ID 的所有开始、结束和 toolResult 消息结束序号，不用后到记录覆盖前值；原始错误字段分别显示 isError=true、isError=false 或未记录，缺失值不按 false 处理。不自动给多次观察配 attempt，也不把 false 改写成用户目标成功。

表中的列名是“toolResult 消息结束序号”。当前数据能证明看见了 message_end，不能证明稳定落盘，更不能证明下一个模型请求确实包含它。页面脚注和文章现在使用相同证据边界。这一命名依据 06、09、10 篇对执行、存储和观察边界的区分。

| 能力 | 当前可核实结果 | 尚缺的证据或实现 |
|---|---|---|
| 原始事件查看 | 内嵌 188 条 Pi core 实验事件，保留 raw | 其他新实验结果尚未接入同一事件模型 |
| 工具关联 | 场景内相同 call ID 的多次观察全部保留 | attempt、session/thread 跨来源关联 |
| 顺序检查 | 拒绝每场景重复或倒退序号 | 缺口报告、流尾完整性证明 |
| 结果解释 | 显示原生错误标志与未观察状态 | 用户目标完成判定、模型可见性证明 |
| 输出形式 | 离线单文件，无外部脚本或 CDN | 大文件分页、在线协作、控制运行 |
| 验证 | 9 项自动检查通过 | 浏览器视觉与交互验收未完成 |

其中 4 个检查验证以下语义边界：同 ID 多次观察不覆盖；缺失或非布尔错误字段不猜成功；消息结束不合并成执行结束；不同场景相同 ID 相互独立。原有 5 项检查覆盖基础输入与 JSON 数据嵌入。它们不包含浏览器渲染或点击验收。[检查](/downloads/agent-harness/11/content/experiments/test_trace_viewer.py)

## 七、原型的结构刻意不走到运行控制

<figure class="article-figure"><a href="/images/agent-harness/11/11-structure.svg" target="_blank" rel="noopener" aria-label="查看完整配图：只读轨迹查看器的数据路径"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/11/11-structure-mobile.svg"><img src="/images/agent-harness/11/11-structure.svg" alt="只读轨迹查看器的数据路径" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

这个图对应当前实现，没有远程采集、跨产品统一状态机或操作回放。生成器使用 JSON 编码后转义 `<`、`>`、`&`，页面通过 textContent 显示原始内容，避免合成输入中的 `</script>` 逃逸数据区。但这仍不是完整不可信文件平台的安全审计，不能据此开放任意上传服务。

单篇下载包可直接运行 `python3 experiments/trace_viewer.py evidence/pi-events.jsonl evidence/trace-viewer.html` 生成查看器，再运行 `python3 -m unittest discover -s experiments -p 'test_trace_viewer.py'` 检查。2026-09-14 在独立交付副本复跑 9 项检查通过，并核对重新生成的 HTML 与所附文件一致。[复现范围](/agent-harness/11-reproduce/) 这些检查没有操作浏览器，不能据此宣称视觉和交互验收通过；历史浏览器尝试因管理员策略核验受阻，未绕过。

## 八、为什么现在不把它扩展成通用平台

固定版本已经有 Codex rollout-trace 的源证据图和 Pi evals 的真实 AgentSession 产物、配对报告。复用它们的原生模型，比先建立一个吞掉所有语义的转换层更有价值。[Codex reducer](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/mod.rs#L39-L135) [Pi 配对报告](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/vitest-evals/summary.ts#L164-L302)

此前 2026-09-12 的定向资料调查还查阅了 [OpenTelemetry 信号](https://opentelemetry.io/docs/concepts/signals/)、[Langfuse 评测](https://langfuse.com/docs/evaluation/overview)和 [Phoenix](https://arize.com/docs/phoenix)。这只是已做调查的记录，没有本地安装、同等数据接入测量或用户访谈，不据此形成当前市场排名。若以后需要多人评测，应先做小范围接入比较，再决定是否扩建自己的平台。

下一步的选择门槛应是具体失败，而不是工具数量：同一 call ID 的恢复重试无法解释时补 attempt 证据；跨子任务来源难追时引入 lineage；真实数据量撑不住单文件时再做分页。每次新增一个关系，都给出构造条件、缺失时如何显示、以及能证伪它的样例。

全系列的最终设计结论是：内核负责明确接纳、调度和所有权，工具与环境负责可执行权限及外部事实，存储负责其声明的持久性，观察器负责保留证据的不完整性。把这些边界写清之后，再选择合并哪些接口、保留哪些状态，才能判断简化是否仍如实表达了执行结果。

<!-- harness-diagram:11-summary -->

<figure class="article-figure"><a href="/images/agent-harness/11/11-summary.svg" target="_blank" rel="noopener" aria-label="查看完整配图：把源码差异转成有代价说明的设计约束"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/11/11-summary-mobile.svg"><img src="/images/agent-harness/11/11-summary.svg" alt="把源码差异转成有代价说明的设计约束" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 11 · 本篇总结：已交付的是只读 Pi 轨迹查看器；运行控制与跨产品状态机仍是建议。*

图示依据：[C10f](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/rollout-trace/src/reducer/code_cell.rs#L80-L129)、[P08e](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L397-L439)、[D06d](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts#L267-L371)、[G08d](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/mod.rs#L1908-L1958)。跨实现比较 · 根据本篇已引源码与明确的实验范围。

<!-- /harness-diagram -->

## 配套材料

发布补充（2026-09-14）：本站[查看页面](/agent-harness/11-viewer/)已完成本地浏览器验收，包括场景切换、事件筛选与清空、原始事件选择、并发顺序和拒绝字段展示，以及手机浅色和桌面深色布局。原始离线 HTML 的桌面场景切换与事件选择也已实测；这些检查补充上文定稿时的验收状态，不扩大真实模型或产品运行验证范围。

[阅读实验说明](/agent-harness/11-evidence/) · [阅读复现入口](/agent-harness/11-reproduce/) · [下载正文、原图与实验材料](/downloads/agent-harness/11/agent-harness-11.zip)（[SHA-256](/downloads/agent-harness/11/agent-harness-11.zip.sha256)）。

下载包保留本篇最终正文、6 张原图、固定版本记录及实验源码；不含上游源码或依赖。复现实验需要联网准备环境，既有实验边界见说明。

<!-- harness-series-nav -->

## 系列阅读

[上一篇：测试通过证明了什么？Harness 的观测证据与评分分母](/agent-harness/10-observability/) · [下一篇：断线之后，Agent 的进度如何接上？四个 Harness 的状态同步与事件恢复](/agent-harness/12-client-recovery/)

<!-- /harness-series-nav -->
