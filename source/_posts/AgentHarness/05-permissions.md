---
title: "一次批准改变了什么？四种 Harness 的权限与沙箱"
description: "用户批准命令后，执行仍可能被沙箱或网络策略拒绝。比较四种 Harness 的批准对象、逐调用提权、重试资格与决策来源，区分授权判断和实际执行隔离。"
intro: "批准一次调用，是否也批准了重试、解除限制或后续调用？本文沿实际执行分支核对审批对象、参数转换和后端能力，说明一次允许究竟覆盖什么。"
kind: article
card_wrap: words
published: true
categories: [Agent Harness]
tags: ["Agent Harness", "源码阅读", "Coding Agent"]
date: 2026-09-14
updated: 2026-09-14
permalink: agent-harness/05-permissions/
related: ["agent-harness/04-tools/", "agent-harness/06-recovery/"]
---

<figure class="article-figure"><a href="/images/agent-harness/05/05.svg" target="_blank" rel="noopener" aria-label="查看完整配图：权限与执行隔离：审批管决策，隔离管实际访问范围"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/05/05-mobile.svg"><img src="/images/agent-harness/05/05.svg" alt="权限与执行隔离：审批管决策，隔离管实际访问范围" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

模型提出运行一条命令，用户同意，命令却被文件或网络策略拒绝。接下来发生什么？这个问题比“有没有权限系统”更能区分四套 Harness：第一次批准覆盖的是受限执行，还是同时覆盖解除限制？失败意味着命令没运行，还是运行了一部分？重试时改变的是一次调用的权限，还是整个会话的默认模式？

回答这些问题，需要分别追查批准、受限执行和失败后的分支。本篇沿固定版本分析：Codex 的两次 attempt、Pi 的参数与 Hook 交界、DeepSeek 的逐调用权限解析、Grok 的多来源决策合并。版本见[源码基线](/downloads/agent-harness/05/content/evidence/versions.json)。这里的实现结论来自源码；实测覆盖 Pi 的调用阻断和 DeepSeek 的提权判定函数，没有做四个产品的 OS 隔离验收。

> 版本与证据：源码基线固定于 2026-09-12，实验记录来自 2026-09-12 至 13 日；本文于 2026-09-14 润色，未重新执行实验。源码事实、局部实验观察与设计判断分别表述，不代表四产品端到端验收。详见[本篇实验说明](/agent-harness/05-evidence/)。


## 先确定授权对象，再讨论允许与拒绝

一次执行至少涉及三个不同对象：模型给出的调用描述、审批方看到的动作，以及执行器最终消费的参数和环境。只要其中一个对象发生变化，旧批准是否仍然适用，就需要具体代码回答。

例如批准 `write("a.txt")`，不能自然推广到“任何工具都可以写”；批准在工作区内执行，也不能自然推广到工作区外。甚至同一条命令重试，执行边界也可能改变。权限判断因此不只是 `allowed: boolean`，还包括来源、适用范围、执行模式和失败后的下一步。

四个实现的选择并不位于同一层。Pi 的轻量 Agent loop 提供回调接口，部署者决定其策略；Codex 编排器同时持有审批与环境信息；DeepSeek 用共享服务解析策略，由工具和 backend 分担执行；Grok 则把静态规则、命令分析、会话授权和分类器纳入一个有优先级的决策流程。比较应沿这些控制权所在的位置展开。

## Codex：第二次 attempt 不是第一次的简单重复

`ToolOrchestrator::run` 先从本次 `StepContext` 读取审批策略，再确定工具对应的 execution environment、权限配置与网络策略。工具可以提供 `exec_approval_requirement`，否则使用默认规则。`Forbidden` 直接返回拒绝；`NeedsApproval` 构造动作和 `ApprovalContext` 后等待批准；看似直接放行的 `Skip`，在 `strict_auto_review` 开启时也会进入审查。[初次审批与环境选择](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/orchestrator.rs#L1-L220)

<!-- harness-diagram:05-codex -->

<figure class="article-figure"><a href="/images/agent-harness/05/05-codex.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Codex：第二次 attempt 有自己的资格与审批"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/05/05-codex-mobile.svg"><img src="/images/agent-harness/05/05-codex.svg" alt="Codex：第二次 attempt 有自己的资格与审批" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 05 · Codex：只能在允许的拒绝路径上再次尝试；不能把批准当作永久通行证。*

图示依据：[C05d](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/orchestrator.rs#L414-L542)、[C05](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/orchestrator.rs#L1-L220)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

这里有两个容易被字段名误导的细节。

首先，环境拥有自己的 network policy 时，请求直接要求 escalated permissions 会被拒绝。后续的 `unsandboxed_allowed` 同样包含 `!owner_network_policy`。这意味着工具编排器不能擅自把 attachment 所拥有的网络边界解除。其次，`SandboxType::None` 不必然表示无隔离：如果进程沙箱由 executor 管理，编排器不在本地再套一层，但仍传递权限配置和 `sandbox_requested`。只看一个枚举，就可能把远端负责执行的隔离误判为缺失。[执行权限与初次 attempt](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/orchestrator.rs#L221-L312)

初次执行失败后，也不是直接询问“要不要提权”。代码先筛选错误种类：只有 `SandboxErr::Denied` 进入这一分支；超时、信号或普通工具错误不会沿同一条路径重跑。即使是 Denied，也依次检查：

1. 如果携带网络策略决策，能否提取当前受管网络允许处理的审批上下文？不能就返回原拒绝。
2. 工具是否允许 `escalate_on_failure`？当前审批策略是否允许这类再询问？
3. 若不允许无沙箱执行，是否至少存在可处理的网络审批上下文？否则仍结束。
4. 是否可以复用批准？严格自动审查和网络审批都不能走普通的批准绕过条件。

`OnRequest` 在这里还有受约束的网络询问例外，不能把附近“Never 或 OnRequest 不重试”的概述注释当成全部规则。[拒绝后的资格检查](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/orchestrator.rs#L312-L414)

最后才构造第二个 `SandboxAttempt`。若允许无沙箱执行，第二次可以解除对应进程限制；若不允许，则根据仍然有效的权限重新选择沙箱。`enforce_managed_network` 继续沿用。第二次不是递归调用整个编排器，因此这一函数内部只有一次初始尝试和一次升级尝试，不会自行无限重复。

严格自动审查还使两次批准具有不同含义：第一次只覆盖受沙箱约束的尝试，第二次改变执行条件后要重新审查。`already_approved` 并不是一个可以清除所有后续门槛的通行证。[重审与第二次 attempt](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/orchestrator.rs#L414-L542)

网络审批生命周期又与普通返回值分开。`run_attempt` 开始网络审批，将其取消令牌和代理配置传给工具；工具失败时先 finalize 这项审批，finalize 的失败可以覆盖原工具错误；成功时则把 deferred approval 随输出一起交还上层。这说明“工具返回了输出”与“相关审批生命周期已经结束”不是同一时刻。[网络审批包围执行](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/orchestrator.rs#L1-L220)

**由代码推出的代价**是：审批、隔离、网络生命周期与重试必须协调，状态更多，但可以保留环境所有者的控制权。另一个边界没有因此消失：沙箱拒绝不证明命令毫无副作用。一条命令可能先完成允许的写入，再碰到被拒绝的访问。是否可重试仍然要结合工具操作本身，见恢复篇（系列相关篇目）。

## Pi：审批方看到的参数是否与执行参数一致

轻量 `agent-loop.ts` 的 `prepareToolCall` 顺序很具体：查工具 → `prepareArguments` → 参数验证 → `beforeToolCall` → 取消检查 → 返回 prepared call。不存在的工具和验证异常会生成即时错误结果。Hook 返回 `block` 同样生成错误结果，不进入工具的 `execute`。[调用准备](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L550-L674)

<!-- harness-diagram:05-pi -->

<figure class="article-figure"><a href="/images/agent-harness/05/05-pi.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Pi：前置 Hook 看见的应是实际执行参数"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/05/05-pi-mobile.svg"><img src="/images/agent-harness/05/05-pi.svg" alt="Pi：前置 Hook 看见的应是实际执行参数" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 05 · Pi：prepareArguments 早于 Hook；拒绝不能撤销准备阶段已经产生的效果。*

图示依据：[P05b](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L607-L714)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

但 Hook 接收到两个不同表示：`toolCall` 是原始调用对象，`args` 是经过准备和验证、随后会交给执行器的参数。假设工具把相对路径或省略值规范化，扩展只根据 `toolCall.arguments` 生成审批界面，就可能让用户批准一种表示，执行器消费另一种表示。源码没有在这里强制每个扩展如何显示请求；**我的设计建议**是根据实际执行参数生成可审阅动作，并把原始表示保留作诊断信息。

前置 Hook 也不是任意副作用的最早边界。`prepareArguments` 已在它之前运行。如果工具作者把文件写入放在参数准备里，“before Hook 拒绝”只能保证后面的 `execute` 不运行，无法撤销更早发生的行为。这不是已发现的 Pi 漏洞，而是由调用顺序限定的保证范围：要把准备阶段当作可安全执行的验证，必须信任工具实现遵守这个约定。

取消检查放在等待 Hook 之后，解决了另一种竞态：用户取消发生在审批等待期间，Hook 随后返回允许，旧调用也不会照常进入执行。这个结论仍局限在框架的检查点；一旦工具开始，是否及时响应取消，要看工具如何使用传入的 signal。[准备与执行交界](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L607-L714)

批次语义还会影响用户对“拒绝”的理解。工具调度篇（系列相关篇目）已实测：整批先完成 preflight，然后执行获准调用。拒绝 B，不会回滚已获准的 A；单项结果中的 `terminate` 也不意味着整个 batch 的全部结果都要求终止。因此，一个“拒绝本次操作”的界面必须知道自己拒绝的是单个 tool call、整个 batch，还是后续模型回合，不能把三者混成一个按钮。

这一实现的优势是小而容易嵌入，代价是策略一致性由使用者负责。它没有在这个回调边界把同进程扩展隔离起来；扩展本身能访问什么，仍取决于宿主与外部环境。[Pi 固定版本权限说明](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/README.md#permissions--containerization)

## DeepSeek：单次提权与会话默认策略分开处理

DeepSeek 的 `sandboxPolicy` 是文件策略的共享所有者，解析优先级为显式批准的 mode、会话日志中的 override、部署默认值。工作区边界来自 session 的 cwd；没有 session 时才使用配置的 fallback root。模型请求里的运行时上下文也读取这个服务，使向模型描述的策略与执行者读取的策略有共同来源。[策略解析](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sandbox/sandbox-policy/src/index.ts#L118-L182)

<!-- harness-diagram:05-deepseek -->

<figure class="article-figure"><a href="/images/agent-harness/05/05-deepseek.svg" target="_blank" rel="noopener" aria-label="查看完整配图：DeepSeek：一次批准只改变本次 request"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/05/05-deepseek-mobile.svg"><img src="/images/agent-harness/05/05-deepseek.svg" alt="DeepSeek：一次批准只改变本次 request" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 05 · DeepSeek：常驻策略（standing policy） 不因此写回；无效扩大不会发起审批。*

图示依据：[D05d](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sandbox/sandbox/src/escalation.ts#L19-L189)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

这不等于把策略写进 prompt 就能约束执行。`tool-bash` 的实际路径会在执行边界重新解析 常驻策略（standing policy），调用 `approveEscalation` 得到 granted mode，然后创建一份只用于这次 request 的 policy。它没有把获准 mode 写回 session 的 `sandbox/mode`。批准一次工作区写入之后，下次未显式提权的调用仍按 常驻策略（standing policy） 解析。[工具消费批准](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/shell/tool-bash/src/index.ts#L187-L393)

提权条件也故意不由 schema 独立决定。schema 对所有会话共享，默认模式可能是完全访问，但某个会话已经切换为只读。如果根据默认模式删掉提权选项，这个受限会话将无法提出合法请求。因此 schema 提供闭合的目标集合，执行时才验证目标严格宽于本次 effective mode：只读可升至工作区写或完全访问，工作区写只能升至完全访问。[共享提权协议](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sandbox/sandbox/src/escalation.ts#L19-L189)

`approveEscalation` 的顺序决定了失败语义：先检查严格扩大，再检查 approval service 和 agent，随后才发出带 tool name、call ID、目标模式及理由的请求。只有 `allowed-once` 返回 mode；拒绝、取消、无可用通道各自抛出不同错误。不合法的扩大请求会在发起审批前被拒绝。外围还校验 `sandbox_permissions` 与非空 `justification` 必须成对出现。

这条边界上还有两种不同的“不存在”：未组合 sandbox executor 时，不仅不向模型展示提权字段，工具运行时也会拒绝绕过 Schema 约定传入的字段；组合了会隔离的 executor 却没有共享 policy service，则在工具插件加载时失败。前者防止把 schema 隐藏误当成强制校验，后者防止同一组合里出现两个相互脱节的策略来源。[组合守卫](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/shell/tool-bash/src/index.ts#L187-L393)

继续追到 `sandbox-local`，可以看到不同后端的选择方式并不相同。Linux 的候选链有 bwrap 和 Landlock，多个候选才按顺序作功能探测，并缓存 provider 生命周期内的选择。macOS 的 Seatbelt 与 Windows ACL 都是单候选，直接选择；无法启动或 runner 拒绝策略，要通过执行时的错误识别来拒绝继续，而不是在限制未生效时继续执行（fail closed）。配置自定义 runner 则跳过内置选择和探测，其 `full` 声明来自部署者断言。[后端选择与 wrap](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sandbox/sandbox-local/src/index.ts#L305-L345)、[选择算法](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sandbox/sandbox-local/src/index.ts#L485-L548)

同样不能把 `full` 理解为所有安全维度都完备。这套 mode 词汇主要描述文件效果。Windows ACL 后端主动报告 `partial`，注释明确提到 Everyone 写权限与 NTFS hard link 的边界；Landlock 的 enforcement 也受 ABI 能力影响。runner 的启动失败规则和普通文件拒绝规则分别携带：例如部分后端同时要求保留退出码和 fatal stderr 特征，减少把子命令输出误判为“命令根本没启动”的机会。[能力与失败分类](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sandbox/sandbox-local/src/index.ts#L150-L237)

这种结构的代价是组合和契约较多，但它把“策略是什么”“本次批准改变什么”“后端能落实到什么程度”分开表达。缺少哪一层，就能给出对应失败，而不能仅凭存在一个 sandbox 包判断部署已具备完整隔离。

## Grok：决策来源决定哪些 Ask 可以交给模型处理

`GatePreflight::evaluate` 一次性读取直接规则、bash command gate 和 shell file access gate。路径使用请求会话的 cwd，未必等于 manager 自己的 cwd；否则相对路径规则可能在错误目录下匹配。三个结果按 deny > ask > allow 合并。[预检结构](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/permission/gate_preflight.rs#L1-L106)

<!-- harness-diagram:05-grok -->

<figure class="article-figure"><a href="/images/agent-harness/05/05-grok.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Grok：auto 模式要保留 Ask 的来源"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/05/05-grok-mobile.svg"><img src="/images/agent-harness/05/05-grok.svg" alt="Grok：auto 模式要保留 Ask 的来源" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 05 · Grok Build：只有分析失败来源的 Ask 才可能交给分类器；这本身不等于放行。*

图示依据：[G05c](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/permission/manager/mod.rs#L1651-L1760)、[G05](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/permission/gate_preflight.rs#L1-L106)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

关键在于 Ask 还保留来源。`AskRuleMatch` 表示明确命中规则要求询问；`AskFailClosed` 表示静态分析无法充分拆解命令。在 auto mode 下，只有存在 fail-closed Ask 且没有任何 rule-match Ask，才设置 `defers_gate_ask`。这并不自动允许执行，只意味着可以交给后续分类器判定。

因此，`echo "$(date)"` 的不可充分分析，与 `echo hi && git push origin main` 命中询问规则，不是同一种不确定性。上游测试正用类似输入区分这两条路线；本轮只审读了测试，没有运行 Grok 测试套件。[来源一致性测试](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/permission/gate_preflight.rs#L151-L201)

读到 manager 才能确定实际优先级。预检在快捷放行之前计算，明确 deny 先返回 `PolicyDeny`，随后才检查 YOLO。会话授权和窄范围 allow 可以在满足条件时跳过分类器，明确规则 Ask 则阻止 auto classifier 取代它。这里不能进一步笼统宣称“所有 Ask 都不能被所有模式跳过”：YOLO 分支检查的是 `shell_forced_prompt` 与 Hook 强制询问，并非所有 `policy_forced_prompt`。规则 Ask 对 auto 模式的约束，与 YOLO 的具体门槛需要分开描述。[manager 决策次序](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/permission/manager/mod.rs#L1651-L1760)

shell file gate 的 Ask 还会阻止 bash grant 抵消它。批准运行某类 bash，不等于批准该命令间接访问的文件。原生路径遇到不可解析的 symlink 时，也能设置阻止 YOLO 的 fail-closed 标记。这些代码说明系统在保留权限来源与跨工具访问语义；没有证明任意 shell 语法、动态路径或竞态都已被静态分析覆盖，更不能代替 OS 访问控制验收。

## 用可区分假设的实验检查边界

已有 Pi 实验检查的不是返回文案，而是被拒绝工具的 `execute` 调用数为零；批次实验另外证明拒绝 B 时 A 仍可执行。它们排除了“先执行再报告拒绝”和“单个拒绝必然阻止整批”两种错误理解。[调度实测](/downloads/agent-harness/05/content/evidence/deep-dive-results.json)

2026-09-13 补充的[权限实验](/downloads/agent-harness/05/content/experiments/permission-lab.ts)，直接导入 DeepSeek 未改动的 `approveEscalation` 与参数配对校验，审批 responder 为 fixture，五组结果全部通过：无效参数配对被拒绝；不扩大 effective mode 时审批调用数为零；缺少 service/agent 时不能取得 grant；三种非允许结果产生不同错误；审批未回答前 Promise 不返回 granted mode，并保留 signal 与 call ID。[实测结果](/downloads/agent-harness/05/content/evidence/permission-results.json)

最后一组没有证明完整审批服务的取消行为，只验证 signal 被原样传入；“输入 policy 未被修改”也不是 session 持久化集成测试。这些函数级实验不执行实际命令，不使用真实网络或 OS 沙箱，不能将这些函数级结果扩写为隔离通过。

| 比较问题 | Codex | Pi 轻量 loop | DeepSeek | Grok |
|---|---|---|---|---|
| 批准覆盖的主体 | 具体 action、step 审查上下文与 attempt | Hook 收到的调用和执行参数 | 带 call ID 的一次 mode 扩大 | access 请求及规则/授权来源 |
| 拒绝后的下一步 | 资格检查后至多再作一次 attempt | 生成该调用的错误结果 | 显式新提权请求；不改 standing mode | 根据来源保留询问、分类或拒绝 |
| 最易误读的字段 | None 不一定没有 executor 隔离 | before 不覆盖更早的准备代码 | full 不代表全部安全维度 | Ask 不只有一种来源 |

我的判断是，权限系统真正需要保存的是“为什么这一次可以执行，以及在哪些边界内执行”。模型可以提出动作，也可以参与不确定请求的分类，但不能因为内容看起来像授权，就替明确的规则改写优先级。执行与审批之间的参数转换、重试边界和后端能力，才是审读代码时最值得追的三条线。

<!-- harness-diagram:05-summary -->

<figure class="article-figure"><a href="/images/agent-harness/05/05-summary.svg" target="_blank" rel="noopener" aria-label="查看完整配图：权限比较要保留批准对象与来源"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/05/05-summary-mobile.svg"><img src="/images/agent-harness/05/05-summary.svg" alt="权限比较要保留批准对象与来源" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 05 · 本篇总结：审批决定允许范围，隔离后端落实范围；任何一张图都不能替代 OS 验收。*

图示依据：[C05d](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/orchestrator.rs#L414-L542)、[P05b](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/agent-loop.ts#L607-L714)、[D05d](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sandbox/sandbox/src/escalation.ts#L19-L189)、[G05c](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-workspace/src/permission/manager/mod.rs#L1651-L1760)。跨实现比较 · 根据本篇已引源码与明确的实验范围。

<!-- /harness-diagram -->

## 配套材料

[阅读实验说明](/agent-harness/05-evidence/) · [阅读复现入口](/agent-harness/05-reproduce/) · [下载正文、原图与实验材料](/downloads/agent-harness/05/agent-harness-05.zip)（[SHA-256](/downloads/agent-harness/05/agent-harness-05.zip.sha256)）。

下载包保留本篇最终正文、6 张原图、固定版本记录及实验源码；不含上游源码或依赖。复现实验需要联网准备环境，既有实验边界见说明。

<!-- harness-series-nav -->

## 系列阅读

[上一篇：工具并发怎样保持顺序？四种 Harness 的准备、执行与提交](/agent-harness/04-tools/) · [下一篇：中断后能恢复什么？四种 Harness 的历史重建与副作用](/agent-harness/06-recovery/)

<!-- /harness-series-nav -->
