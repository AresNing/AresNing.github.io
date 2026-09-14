---
title: "多个 Hook 如何协作？四种 Harness 的扩展与卸载"
description: "两个 Hook 同时修改参数时，谁的结果生效？比较四种 Harness 的原始输入、顺序变换和失败聚合，再追踪插件卸载如何等待尚未完成的初始化与资源清理。"
intro: "注册了相同的 Hook 名称，不代表扩展会按相同方式组合。本文从参数改写和卸载竞态出发，区分控制效果、失败处理与资源所有权。"
kind: article
card_wrap: words
published: true
categories: [Agent Harness]
tags: ["Agent Harness", "源码阅读", "Coding Agent"]
date: 2026-09-14
updated: 2026-09-14
permalink: agent-harness/07-extensions/
related: ["agent-harness/06-recovery/", "agent-harness/08-subagents/"]
---

<figure class="article-figure"><a href="/images/agent-harness/07/07.svg" target="_blank" rel="noopener" aria-label="查看完整配图：插件与扩展生命周期：卸载应收回注册，并等待资源清理"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/07/07-mobile.svg"><img src="/images/agent-harness/07/07.svg" alt="插件与扩展生命周期：卸载应收回注册，并等待资源清理" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

假设两个前置 Hook 都要修改工具参数。A 将相对路径转成绝对路径，B 为输出文件增加后缀。最终结果究竟是 B(A(input))，还是两者各读原始输入、最后选一个结果？如果 A 比 B 慢，结果会不会改变？

再假设插件卸载时，一个异步资源还在初始化。这里把释放资源的回调称为 disposer。框架是等它建立之后再清理，还是因为卸载时尚未拿到 disposer，就把它留在宿主里？

这两组问题分别对应扩展的组合语义和生命周期语义。仅列举支持的 Hook 名称，还不足以判断扩展如何组合、如何卸载。本篇沿[固定源码](/downloads/agent-harness/07/content/evidence/versions.json)追踪三个对象：传给扩展的输入、扩展返回值如何聚合，以及扩展拥有的资源何时被回收。

> 版本与证据：源码基线固定于 2026-09-12，实验记录来自 2026-09-12 至 13 日；本文于 2026-09-14 润色，未重新执行实验。源码事实、局部实验观察与设计判断分别表述，不代表四产品端到端验收。详见[本篇实验说明](/agent-harness/07-evidence/)。


## Skill 提供决策材料，Hook 改变运行行为，插件承载生命周期

这些名词可以互相包装，但不能据此合并权力范围。以 Pi 的 `skills.ts` 为例，加载器通过 `ExecutionEnv` 读取文件，返回 skill 和诊断；`loadSourcedSkills` 保留调用方提供的 source 标签，却不解释标签的权限。`formatSkillInvocation` 将内容及相对引用位置组装成给模型的文本。这个路径本身没有注册工具或执行 skill 里的命令。[Skill 加载与调用文本](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/skills.ts#L38-L112)

因此“模型读到了一个 skill”不等于宿主已经授予其中提到的动作权限。反过来，一个代码插件可以注册工具、服务和事件，它的资源生命周期也不能仅靠删除那段说明文字结束。后面的比较聚焦实际执行接口，不把文件分发方式当成运行时保证。

## Codex：前置 Hook 并发执行，改写由完成顺序决定

Codex 的 `PreToolUseRequest` 包含 tool name、tool input、call identity、turn、cwd 和 permission mode。匹配器兼容工具别名，但 `select_handlers_for_matcher_inputs` 对每个 handler 只检查一次：正则同时匹配多个 alias，不会让同一个 Hook 为同一调用执行多次。这是避免兼容层产生重复效果的一道小而必要的约束。[匹配与执行](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/hooks/src/engine/dispatcher.rs#L30-L193)

<!-- harness-diagram:07-codex -->

<figure class="article-figure"><a href="/images/agent-harness/07/07-codex.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Codex：同步 Hook 可以并发，改写按完成序选择"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/07/07-codex-mobile.svg"><img src="/images/agent-harness/07/07-codex.svg" alt="Codex：同步 Hook 可以并发，改写按完成序选择" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 07 · Codex：A、B 各读原 input；不是 B(A(input))，展示顺序也不是冲突胜出顺序。*

图示依据：[C07c](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/hooks/src/events/pre_tool_use.rs#L70-L172)、[C07d](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/hooks/src/events/pre_tool_use.rs#L192-L326)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

真正值得注意的是 `execute_handlers_with_metadata`。同步 Hook 进入 `FuturesUnordered`，共享克隆出的同一份 `input_json`；这里的 sync 表示当前调用要等待它们，不表示这些 Hook 彼此串行。每个结果记录 `completion_order`，全部完成后又按配置顺序排序，便于稳定展示。

`PreToolUse::run` 对这些结果作另一种聚合：任意有效 block 都使工具阻断；block reason 取结果数组中第一个可用原因；没有 block 时，`latest_updated_input` 按 completion_order 取最后完成的有效改写。**展示顺序与冲突胜出顺序并不相同。**[前置结果聚合](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/hooks/src/events/pre_tool_use.rs#L70-L172)

因此，A、B 都读原始 input，A 慢于 B，最终可能取 A 的完整更新值，并非 B(A(input))，也不是固定“配置末尾的 B 获胜”。代码在选择一个 Value，没有逐字段合并多个改写。若两个 Hook 分别规范化不同字段，部署者不能想当然地认为两份修正会同时保留。

这是由控制流推导的可重复性代价，而非对作者动机的猜测：并发减少串行等待，但有冲突的变换会把实际耗时引入结果选择。本文未运行 Codex Hook 引擎；这个竞争例子是源码推演，不能描述成本机观察。

Hook 的 error 与 block 也不同。pre-tool parser 把执行错误、无效 JSON、一般非零退出记录为 Failed，但初始 `should_block` 仍为 false；退出码 2 还需要非空 stderr 理由才构成有效阻断。输入序列化失败同样返回非阻断 outcome。这条具体 Hook 路径并非“发生任何错误就拒绝工具”，不能将它单独作为不可失效的安全屏障。[失败解析](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/hooks/src/events/pre_tool_use.rs#L192-L326)

异步 Hook 则被调度到 runtime，当前结果集合不等待它的控制决策；`can_apply_control_effects` 仅允许同步 Hook 施加控制效果。异步是权限语义变化，不能仅理解成把一个任意阻断型 Hook 加速执行。[控制效果资格](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/hooks/src/engine/mod.rs#L138-L157)

最后，改写不是停在 Hook 返回值里。core `ToolRegistry` 用工具的 `with_updated_hook_input` 将 Hook 表示转换回 invocation；转换失败就通知 handler 尚未执行并返回错误，成功后才调用实际 handler。对 shell 或 MCP 等不同工具，Hook 面向的表示与内部 payload 的对应必须由工具维持。这条接线说明，扩展协议的输入 schema 也是执行边界的一部分。[改写进入实际调用](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/registry.rs#L567-L670)

## Grok：顺序执行不等于流水线变换

Grok 的 `dispatch_sequential_gate` 在循环里逐一 await `runner::run_hook`。但是每次传入的仍是原始 `envelope`，不是上一 Hook 的 `updated_input`。`record_rewrite` 用 replace 保存后来的改写，并记录它覆盖了哪个 Hook；因此这是一组按顺序执行的检查，最终选择最后一个提供的改写，不是逐步变换输入的 变换流水线。[顺序 gate](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-hooks/src/dispatcher.rs#L91-L275)、[改写与 Ask 聚合](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-hooks/src/dispatcher.rs#L278-L350)

<!-- harness-diagram:07-grok -->

<figure class="article-figure"><a href="/images/agent-harness/07/07-grok.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Grok：顺序检查原输入，不是变换流水线"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/07/07-grok-mobile.svg"><img src="/images/agent-harness/07/07-grok.svg" alt="Grok：顺序检查原输入，不是变换流水线" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 07 · Grok Build：Deny 会短路并丢弃先前改写；Failed 则记录诊断后继续。*

图示依据：[G07b](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-hooks/src/dispatcher.rs#L91-L275)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

三个规则决定它与 Codex 的差别。第一，有效 Deny/Block 会立即返回，不再调用后续 Hook，并丢弃此前累计的改写与附加上下文。第二，Allow 不会把之前的 Ask 抹掉；最终优先选择 block、pending ask、defer，再到 allow。第三，Hook Failed 只记诊断并继续，注释明确标成 fail-open，即该 Hook 执行失败本身不阻断工具；一个执行失败的 Hook 与一个正常返回拒绝的 Hook，含义不同。

所以 A 先改写、B 再 Deny 时，Grok 的 C 不会运行；Codex 已经并发启动的匹配 Hook 则由 dispatcher 等到聚合完成。两者对最终工具都可以阻断，却对 Hook 自己是否已经产生效果有不同影响。**阻止业务工具执行，不等于撤销前置扩展本身的副作用。**

管理策略来源也要分别看。`is_disabled` 使 managed policy Hook 不受普通禁用项跳过，但“不能被用户禁用”不等于“运行失败一定阻断”。前者是配置选择规则，后者是 runtime failure policy，这个 dispatcher 的 Failed 分支仍然会忽略失败贡献。[来源与禁用](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-hooks/src/dispatcher.rs#L1-L98)

顺序 Hook 还会把等待时间累加到工具关键路径。command runner 对写 stdin 与等待输出设置超时，并使用 `HookProcessGuard` 管理 process group；session scope 已关闭时，注册失败会杀组并结束。异常退出/超时时，guard 触发 kill 和有界 reap，避免仅回收直接子进程而忘记后代。[进程组所有权](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-hooks/src/runner/command.rs#L36-L100)、[超时与 scope 关闭](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-hooks/src/runner/command.rs#L217-L286)

这条回收路径也有前提：process group 创建或 attach 失败会告警并返回 None，不能无条件宣称所有平台和所有进程树都已被回收。本文未执行 Grok 原生 command/HTTP Hook，进程隔离与取消仍属于源码审读，而非本机验收。

## Pi：同一个仓库里也不能把两套 Hook 语义混写

轻量 `agent-loop.ts` 接收单个 `beforeToolCall`、`afterToolCall` 回调。后置回调发生在 execute 之后，可以改写结果字段；抛异常时，整个结果被替换成错误文本和空 details。这就是已有实测中的“工具副作用已发生一次，模型收到 error”。[轻量后置回调](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L720-L773)

<!-- harness-diagram:07-pi -->

<figure class="article-figure"><a href="/images/agent-harness/07/07-pi.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Pi durable HookRegistry：变换真正逐级传递"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/07/07-pi-mobile.svg"><img src="/images/agent-harness/07/07-pi.svg" alt="Pi durable HookRegistry：变换真正逐级传递" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 07 · Pi：这一图只描述 durable Registry；轻量 loop 的后置异常语义不同。*

图示依据：[P07c](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/hooks.ts#L165-L203)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

durable Harness 的 `HookRegistry` 则是多监听器聚合器。`beforeTool` 按注册顺序执行，将上一个结果的 args 传给下一个。它真正形成 B(A(input))；遇到 block 或异常会停止后续 Hook，异常经 reporter 记录后转为 block。[durable 前置聚合](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/hooks.ts#L165-L203)

其 `afterTool` 又使用不同失败语义：有效结果更新当前 content、details、usage、isError 及返回 patch；下一个 Hook 读到前面的有效变换。某个 Hook 抛异常时，reportError 后继续，不用这个异常替换已经取得的工具结果，也不自动设置 isError。这里假设 error reporter 自身正常完成；reporter 再抛错仍可使聚合 promise 失败。[durable 后置聚合](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/hooks.ts#L293-L337)

因此，“Pi after Hook 出错就把工具标为失败”需要限定到具体入口。它适用于前面直接测到的轻量 loop 路径，不能覆盖 durable Registry。研究报告必须指明是哪层入口，否则两个真实源码事实会被误写成相互矛盾的产品行为。

注销也不是取消正在进行的执行。`on` 返回的函数只是从注册数组删除对应项；`registrationsFor` 在一次聚合开始时克隆数组。如果 A 正在等待，B 已进入该次快照，即使此时注销 B，当前聚合仍会执行 B，下次才不再调用。这种快照语义使一次遍历不受中途修改破坏，但使用方必须另设工作所有者，才能等待已经接纳的任务结束。[注册注销](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/hooks.ts#L15-L86)、[每次聚合的快照](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/hooks.ts#L414-L443)

2026-09-13 的局部实验调用原始 Registry，验证了三个场景：输入 1 经 A 加一、B 乘十得到 20，B 实际看见 2；before 异常阻断后续，而 after 异常保留前面 patch 并继续后续；等待 A 时注销 B，B 本轮仍执行一次，下一轮不执行。[实测](/downloads/agent-harness/07/content/evidence/extensions-results.json)

这些测试使用原始 Context 和 HookRegistry，但 gate 是受控准入替身，没有验证整个 Harness 的取消、关闭或资源回收协议。尤其 `off()` 没有返回等待已运行回调的 Promise，不能用它的返回证明扩展已停止所有活动。

## DeepSeek / Cordis：依赖版本、初始化和清理共享同一个生命周期

DeepSeek vendored Cordis 的 Fiber 通过 `_refresh` 为依赖集合生成 epoch：不是仅看服务名称存在，而是拼接实际 provider Fiber 的 uid；缺少依赖则进入 INACTIVE。provider 被另一个实例替代，即使名称没变，epoch 也会改变，促使 consumer 卸载并重新加载。[依赖 epoch 与加载状态](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L611-L673)

<!-- harness-diagram:07-deepseek -->

<figure class="article-figure"><a href="/images/agent-harness/07/07-deepseek.svg" target="_blank" rel="noopener" aria-label="查看完整配图：DeepSeek / Cordis：先登记清理，再异步初始化"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/07/07-deepseek-mobile.svg"><img src="/images/agent-harness/07/07-deepseek.svg" alt="DeepSeek / Cordis：先登记清理，再异步初始化" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 07 · DeepSeek：同一 effect 内逆序清理；不同 effects 的卸载可能并发。*

图示依据：[D07](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L400-L552)、[D07d](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L675-L709)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

`_reload` 在执行插件代码前跨过一个微任务边界，再检查 epoch 是否仍与开始时一致。这避免“已经安排加载，但同一时段卸载或依赖变化”的旧启动任务继续运行。加载期间旧 epoch 被废弃，也会转入 `_unload`；不是只把列表里的插件状态改为 disabled。

资源登记的关键则在 `effect()`。它在运行插件提供的 execute 之前，先把包装 disposer 放入 Fiber 的 `_disposables`。如果初始化内部重入触发 owner 卸载，owner 已能看到这个 effect。初始化尚未完成时，disposer 等待 setup barrier；异步初始化稍后返回清理函数，再执行清理，并将 in-flight teardown 保留为 owner 可等待的工作。[初始化与卸载竞争](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L400-L552)

这解决的是“资源在卸载以后才初始化完成”的资源遗漏窗口。仅在 `await setup()` 之后才登记 disposer，会让 owner 在等待期间看不到资源。局部实验用两个受控 Promise 分别阻塞 setup 与 cleanup：释放 setup 前 dispose 不结束；cleanup 已开始但未释放时仍不结束；最后清理一次，owner 才结算。[原始 Cordis 实测](/downloads/agent-harness/07/content/evidence/extensions-results.json)

清理顺序必须分层描述。一个 effect 收集的 disposers 在内部逆序调用；遇到异步清理后，前一个 disposer 要等后一个完成。同一个 Fiber 拥有的多个独立 effect，则由 `_unload` 的 Promise.all 并行等待。不能从“effect 内是 LIFO”推出整个插件系统有一个全局的逆序清理栈。[effect 内清理](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L400-L552)、[Fiber 卸载](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L675-L709)

实测分别锁住两层：单个 effect 中 B 开始并等待时，A 尚未运行；两个独立 effect 则都开始清理，然后 owner 等它们一起结束。需要 B 完成后才能释放 A 的资源，应表达在同一有序清理关系里，不能依赖两个独立 effect 的注册顺序。

清理失败也需要区分发生在哪一层。`_unload` 捕获每个 effect 的清理错误并记录日志，其他独立 effect 仍可收尾；这也意味着 owner dispose 正常结算不代表没有清理失败。单个 effect 内没有对每个 disposer 单独隔离异常：局部实验让逆序执行的 B 同步抛错，A 没有被执行。这排除了“框架一定会尝试所有 disposer”的过强理解，插件作者仍需让关键 cleanup 自行保证 finally 或错误聚合。[清理失败实验](/downloads/agent-harness/07/content/evidence/extensions-results.json)

依赖替换实验还验证 consumer 启动两次、清理两次：第一次 provider 消失后先卸载，第二个同名 provider 出现再启动。它证明 vendored Cordis 这一模块的依赖生命周期，并不等于任意 DeepSeek profile 都允许在运行中热换整套配置。完整 CLI/SDK/web 的 composition 和 live patch 开关，仍由各 profile 的加载方式决定。

## 把差异写成可以预测行为的表

| 问题 | Codex PreToolUse | Grok sequential gate | Pi durable HookRegistry | Cordis effect/Fiber |
|---|---|---|---|---|
| 多扩展读什么 | 同一份原始 input | 同一份原始 envelope | 前一个有效变换后的值 | 插件绑定的依赖实例与 context |
| 冲突如何决定 | 最后完成的有效改写；block 优先 | 顺序中最后一次改写；deny 短路 | 顺序变换；before block 短路 | 依赖 epoch 决定卸载/重新加载 |
| 异常是否等于拒绝 | 此前置 parser 中不是 | Failed 贡献被忽略 | before 阻断；after 报错后继续 | 初始化与清理错误分开处理 |
| 删除注册能否代表已收尾 | 需继续核对 runtime 任务所有者 | 需核对 command scope 与进程组 | off 不取消本次快照 | owner 等已登记的异步 setup/cleanup |

2026-09-13 的[扩展实验](/downloads/agent-harness/07/content/experiments/extensions-lab.ts)共 8 组通过：Pi 3 组，Cordis 5 组；与原来的监听器卸载、依赖等待和 Pi 轻量 after 失败实验分别保存。没有运行 Codex/Grok Hook 引擎，没有测试任意第三方插件，也没有以函数实验替代原生进程验收。

我的设计判断是，扩展协议至少要公开三件事：输入是原始快照还是前序输出，多个返回值如何组合，以及取消/卸载会等待什么。观察型 Hook 可以容忍部分失败；权限型 Hook 的失效策略必须独立说明；变换型 Hook 需要确定冲突规则。异步资源则必须在开始创建之前就登记到明确的所有者之下，否则 dispose 无法等待尚未登记的初始化与清理工作。

<!-- harness-diagram:07-summary -->

<figure class="article-figure"><a href="/images/agent-harness/07/07-summary.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Hook 的组合规则比 Hook 名称更重要"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/07/07-summary-mobile.svg"><img src="/images/agent-harness/07/07-summary.svg" alt="Hook 的组合规则比 Hook 名称更重要" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 07 · 本篇总结：判断顺序、变换输入与生命周期是三份契约；阻断工具不回滚 Hook 副作用。*

图示依据：[C07c](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/hooks/src/events/pre_tool_use.rs#L70-L172)、[P07c](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/hooks.ts#L165-L203)、[D07](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/fiber.ts#L400-L552)、[G07b](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-hooks/src/dispatcher.rs#L91-L275)。跨实现比较 · 根据本篇已引源码与明确的实验范围。

<!-- /harness-diagram -->

## 配套材料

[阅读实验说明](/agent-harness/07-evidence/) · [阅读复现入口](/agent-harness/07-reproduce/) · [下载正文、原图与实验材料](/downloads/agent-harness/07/agent-harness-07.zip)（[SHA-256](/downloads/agent-harness/07/agent-harness-07.zip.sha256)）。

下载包保留本篇最终正文、6 张原图、固定版本记录及实验源码；不含上游源码或依赖。复现实验需要联网准备环境，既有实验边界见说明。

<!-- harness-series-nav -->

## 系列阅读

[上一篇：中断后能恢复什么？四种 Harness 的历史重建与副作用](/agent-harness/06-recovery/) · [下一篇：子 Agent 何时才算结束？创建、接纳与资源回收](/agent-harness/08-subagents/)

<!-- /harness-series-nav -->
