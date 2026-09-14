---
title: "子 Agent 何时才算结束？创建、接纳与资源回收"
description: "spawn 返回错误不一定表示子任务从未创建，子任务给出结果也不一定已经退出。比较四种 Harness 的配置继承、首条输入、取消和资源回收，检查每个阶段的责任归属。"
intro: "父任务取消时，谁仍持有子任务的控制句柄？从创建到结果再到清理，本文沿四套固定源码检查每次责任交接，并分析一个受控真实子进程的取消反例。"
kind: article
card_wrap: words
published: true
categories: [Agent Harness]
tags: ["Agent Harness", "源码阅读", "Coding Agent"]
date: 2026-09-14
updated: 2026-09-14
permalink: agent-harness/08-subagents/
related: ["agent-harness/07-extensions/", "agent-harness/09-clients/"]
---

<figure class="article-figure"><a href="/images/agent-harness/08/08.svg" target="_blank" rel="noopener" aria-label="查看完整配图：子 Agent 的责任归属：独立上下文、进程和工作区分别检查"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/08/08-mobile.svg"><img src="/images/agent-harness/08/08.svg" alt="子 Agent 的责任归属：独立上下文、进程和工作区分别检查" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

父 Agent 发出一次 spawn，子任务已经创建，但第一条消息还没被接纳。此时用户取消，谁负责回收子任务？如果 spawn 返回错误，是否意味着什么都没创建？如果父任务停止输出，是否意味着子线程已经退出、工作区可以删除？

这些问题不能从“支持多 Agent”四个字推出来。需要分别追踪创建、注册、首条输入、结果和清理五个边界。四套实现对这些边界的组织不同，独立上下文、独立进程和独立工作区也不能互相替代。

本文使用[固定提交源码](/downloads/agent-harness/08/content/evidence/versions.json)。2026-09-13 的局部实验包含 Pi 示例原函数配受控的真实 Node 子进程，以及 DeepSeek 原始策略/收尾函数；没有启动真实模型 Agent，没有把示例实验当成四产品整体多 Agent 验收。

> 版本与证据：源码基线固定于 2026-09-12，实验记录来自 2026-09-12 至 13 日；本文于 2026-09-14 润色，未重新执行实验。源码事实、局部实验观察与设计判断分别表述，不代表四产品端到端验收。详见[本篇实验说明](/agent-harness/08-evidence/)。


## 从预留身份到释放资源，要经过哪些边界

<figure class="article-figure"><a href="/images/agent-harness/08/08-structure.svg" target="_blank" rel="noopener" aria-label="查看完整配图：子任务从预留身份到清理结算"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/08/08-structure-mobile.svg"><img src="/images/agent-harness/08/08-structure.svg" alt="子任务从预留身份到清理结算" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

这里的“发布”指子任务进入注册表并可被其它组件观察。在发布之前，调用者甚至可能还不知道子任务身份，创建方需要负责撤销尚未交出的资源。发布之后，子任务可能已被其它观察者看见，撤销需要成对的退出事件或明确终止状态；已经发出的通知无法从观察者那里撤回。首条输入是否接纳，又决定这个身份是否已经承担具体工作。

因此，可靠性分析不应只检查 spawn 的返回值。要检查失败发生在哪条边界之前、哪些资源已经对外可见，以及之后由谁持有可取消、可等待、可释放的句柄。

## Codex：配置继承、容量预留和首条输入是不同步骤

V1 `spawn_agent` handler 先解析消息、角色和 fork 标志，从父 session source 计算 child depth，超过最大深度就拒绝。之后构建配置，依次应用请求的 model/reasoning、非 full fork 的角色、service tier 和运行时覆盖；full-history fork 不允许再覆盖 agent type。[工具入口](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/handlers/multi_agents/spawn.rs#L1-L145)

<!-- harness-diagram:08-codex -->

<figure class="article-figure"><a href="/images/agent-harness/08/08-codex.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Codex：注册身份早于首条消息成功"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/08/08-codex-mobile.svg"><img src="/images/agent-harness/08/08-codex.svg" alt="Codex：注册身份早于首条消息成功" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 08 · Codex：首条消息失败时，不能仅凭错误返回断言子线程从未存在。*

图示依据：[C08e](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/agent/control/spawn.rs#L723-L810)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

关键不是“clone 一份父 config”。`build_agent_shared_config` 用 live turn 的 model/provider、reasoning 和 developer instructions 修正持久配置，再由 runtime override 同步 approval policy、cwd 和 permission profile。角色或模型选择后再次应用 runtime override，避免子角色配置让运行时权限与父 turn 脱节。[配置来源与覆盖次序](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/handlers/multi_agents_common.rs#L175-L266)

这说明继承的是一份在创建边界解析出的执行配置，不是父任务未来所有变化的实时镜像。传递相同 cwd 和 environment selection，也不构成新的工作区隔离；这条默认路径没有因为子 thread 身份独立，就自动生成独立 worktree。

进入 `AgentControl` 后，深度限制之外还有容量管理。普通 spawn 预留 counted slot；V2 resident child 另走 residency reservation，并将相应 thread reservation 的上限设为 None。这不表示 V2 无限制，而是不同容量由不同机制治理。`SpawnReservation` 在成功创建前持有配额；未 commit 就离开作用域，会归还计数及预留路径。[创建与容量](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/agent/control/spawn.rs#L620-L728)、[reservation 生命周期](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/agent/registry.rs#L356-L404)

一个容易错过的顺序是：新 thread 创建完成后，reservation 已 commit，随后才通知 thread created、记录 spawn edge，再 `send_input`。因此，首条输入投递失败发生在可见身份已经创建之后；该函数此处以 `?` 返回错误，没有把整个创建过程重新折回“从未存在”。不能把 spawn Err 当作无副作用的事务回滚证明，也不能仅据此认定永久孤儿，因为 registry 已掌握身份，仍有后续生命周期管理入口。[发布后投递](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/agent/control/spawn.rs#L723-L810)

关闭则需要区分 `interrupt_agent` 与 `close_agent`。前者发送 `Op::Interrupt` 给目标当前任务，不负责在这个函数中递归关闭整个子树。后者尝试把 persisted spawn edge 标成 Closed，再沿内存中可达的 live descendants 关闭树。`shutdown_agent_tree` 先取得后代快照，再关闭目标、遍历后代；目标失败仍会进入后代收尾，但某个后代遇到非“已消失”错误会提前返回。[中断与关闭](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/agent/control.rs#L361-L397)、[树关闭路径](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/agent/control/legacy.rs#L46-L117)

这个实现不能简化成“所有后代必然已经退出”：快照不包括未来并发创建的后代，也不等于对 spawn admission 加锁封口。另一条 root turn suspension 路径甚至明确在发现 live descendants 时拒绝挂起，并注明这个检查只是当前快照。[挂起前的后代检查](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/session/turn_suspension.rs#L13-L46)

工具的关闭结果还有一个细节：`CloseAgentResult` 返回的是 `previous_status`。它供调用方理解关闭前状态，不是关闭之后每项资源的状态快照。生命周期动作成功、状态查询和资源验收，仍是不同证据。[关闭工具的返回契约](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/tools/handlers/multi_agents/close_agent.rs#L106-L152)

## Pi：进程式委派示例的强项与取消缺口

这里研究的是 coding-agent 的 subagent 扩展示例，不能把它当成 Pi 所有接口默认拥有的核心服务。`runSingleAgent` 构造 `--mode json -p --no-session`，启动子进程，通过逐行 JSON 事件累计消息和 usage，等待 close 后返回结果。cwd 使用任务显式值或父 cwd，因此多个子进程默认可以访问同一工作目录。[实际启动与事件收集](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L272-L409)

<!-- harness-diagram:08-pi -->

<figure class="article-figure"><a href="/images/agent-harness/08/08-pi.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Pi 示例：killed 标志不证明进程已经退出"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/08/08-pi-mobile.svg"><img src="/images/agent-harness/08/08-pi.svg" alt="Pi 示例：killed 标志不证明进程已经退出" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 08 · Pi：实验使用受控 Node 子进程；显式强杀并等待退出，另设 watchdog 防止遗留。*

图示依据：[P08e](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L397-L439)。原函数 + 受控真实子进程实测。

<!-- /harness-diagram -->

模型继承比“使用父模型”更细：没有 agent 专属 model 时，继承 dispatch model 和 thinking level；一旦 agent 定义给出 model，就不再传父 thinking level，让该模型自行决定相应默认。这与后文 DeepSeek “换 route 时清除继承 effort”的行为相近：不把旧模型的运行参数机械套到新路由。本文对 Pi 两种分支均用原函数构造参数实测，未调用模型。

项目定义的信任也有实际条件。默认 agentScope 为 user；选择 project/both、允许确认、存在 UI、项目尚未受信任，并且请求实际引用项目 Agent 时，才弹出确认。不能写成“项目 Agent 总需要人工批准”：没有 UI 时这段确认分支不会运行。是否允许加载项目配置，仍需由部署的入口和策略决定。[项目来源确认](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L483-L549)

调度方面，示例最多接受 8 个 parallel tasks，工作池并发上限为 4。`mapWithConcurrencyLimit` 持有共享 nextIndex，某个 worker 完成后立即领取下一项，结果写入原输入位置；结果顺序稳定不代表执行顺序固定。chain 则把前一步最终文本替换到下一步的 `{previous}` 中，失败就停止。这是文本交接，不是完整继承前一步会话、隐藏推理或所有工具历史。[工作池](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L219-L237)、[chain 与并发入口](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L550-L666)、[容量常量](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L31-L37)

异常路径揭示了示例调度的限制：池等待 `Promise.all(workers)`，一个 worker reject 会使聚合 promise 先返回错误，并不会等待或取消仍运行的同伴。我们的受控实验让 A 抛错、B 仍阻塞，确认聚合已经 reject 而 B 尚未结束。若使用方把“工具已报错”作为所有子工作已经停下的依据，就会产生所有权误判。[调度实测](/downloads/agent-harness/08/content/evidence/subagent-results.json)

取消路径还存在一个更具体的问题。`killProc` 设置 wasAborted，发送 SIGTERM，再安排 5 秒后 `if (!proc.killed) proc.kill("SIGKILL")`。但“信号发送成功”的 killed 标记不等于进程已退出。对忽略 SIGTERM、继续运行的进程，killed 为 true，备用强杀条件反而不会成立；原函数又等待 close 才检查 wasAborted，可能一直无法结算。[取消分支](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L397-L439)

这一判断还通过局部实验核对。实验通过 AST 提取未改动的 `runSingleAgent`，只将 CLI 命令解析替换为可控 Node 子进程；子进程明确接收 SIGTERM 后继续运行。原 5 秒 timer 已触发时，观察到 killed 为 true、exitCode/signalCode 仍为空、父 run 仍 pending。实验确认该状态后，主动发出 SIGKILL 并等待回收，原函数才以 Subagent was aborted 拒绝；另设 8 秒 watchdog 作为失败兜底。原结果字段 watchdogKillRequired 表示需要额外强杀，不能据此判断兜底 timer 实际触发。[提取范围与替身边界](/downloads/agent-harness/08/content/evidence/subagent-extraction.json)、[结果](/downloads/agent-harness/08/content/evidence/subagent-results.json)

这个发现限定于固定版本示例的原函数及受控子进程，不是对完整 Pi CLI 的恢复、所有扩展或任意平台作出结论。示例还只对直接 child 使用 kill，没有在这段函数建立专用进程组。若要把它作为长驻生产委派层，退出证据、树形回收和失败后等待同伴，都需要独立补齐。

## DeepSeek：发布前后交接句柄，子任务不会继承一次性提权

DeepSeek 的 `startInProcessRun` 专门处理 one-shot 子任务。它先检查 max depth 和预先取消，在第一个 await 之前捕获委派策略，随后准备 child ID、fork seed 和 activation boundary，交给 `agents.create`。[one-shot 入口](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent-in-process-driver/src/index.ts#L1-L180)

<!-- harness-diagram:08-deepseek -->

<figure class="article-figure"><a href="/images/agent-harness/08/08-deepseek.svg" target="_blank" rel="noopener" aria-label="查看完整配图：DeepSeek：结果完成后，还要等待句柄清理"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/08/08-deepseek-mobile.svg"><img src="/images/agent-harness/08/08-deepseek.svg" alt="DeepSeek：结果完成后，还要等待句柄清理" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 08 · DeepSeek：成功结果不能掩盖 dispose 失败；两种错误可一起保留。*

图示依据：[D08g](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent/src/run-settlement.ts#L28-L75)、[D08](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent-in-process-driver/src/index.ts#L1-L180)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

为什么策略要同步捕获？如果创建过程中父任务切换模式，已经发起的委派不应意外继承未来状态。更重要的是，`captureDelegatedPolicyOverrides` 只复制父 session 的显式 sandbox override，不复制部署默认值或单次批准；若存在 approval 服务，子任务 approval policy 被固定成 never，而不是复制父 approval mode。随后这些值作为 `source: delegation` 事件写入 child log，位于 fork seed 之后，使新策略压过 seed 中的旧值。[委派策略](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent/src/child-agent.ts#L219-L270)

这是一种明确的权限收窄策略：子任务在委派边界的范围内执行，不自行把询问上推为新的提权许可。它仍不是永久不可变的系统规则，源码说明之后的 child mode event 可以覆盖之前的记录；本文确认的是创建时的 seed 语义。原函数实验验证了父后续切换不改变已捕获值、approval 被固定为 never，以及没有 override 时不会把 defaultMode 复制为子任务显式覆盖值。

模型与能力的继承也有条件。child options 默认继承父 provider/model、effort、maxTokens，再覆盖请求值；route 改变但未明确指定 effort 时删掉继承 effort。composition 从父 live preset 组合，添加委派上下文与 persona，并通过 `tools.restrict` 应用 tool filter。独立 child session 因而不等于所有服务配置完全重置，也不等于已经获得独立目录。[配置与能力组合](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent/src/child-agent.ts#L87-L217)

更深的所有权在 agent-loop factory。`prepare` 在创建资源之前就登记一个 memoized disposer，同时绑定 caller cancellation、owner Fiber 和 factory teardown。随后 `setupAndPublish` 等待未发布 setup、执行可选同步 commit、保存未落盘 suffix，再 publish session 和 agent。announce listener 可能重入触发取消，所以每个对外通知之后再次 `assertLive`；失败时等待 disposer 回滚。[资源所有权与对外发布](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/index.ts#L525-L690)、[setup/存储/发布事务](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/index.ts#L804-L837)

通知并不是数据库事务。前一个 listener 已看见 created，后一个 listener 抛错，并不能消除前者的观察。因此 registry 的契约是用 disposed 配对已开始的创建通知，而不是承诺“失败过程完全不可见”。这是比一句原子创建更准确的外部语义。[创建与 handle 契约](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent/src/index.ts#L147-L188)

发布后 `drivePublishedRun` 接管 handle，安装父 signal 的取消 listener，再立即检查 signal 是否已 aborted，补上跨 await 返回时取消已经发生的窗口。未取消才发送 followup 并等待 `whenIdle`。结果只扫描 activation boundary 之后的 child events，所以 fork 的父历史不会被记成这次子任务的产出和结算。[发布后的取消与结果](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent-in-process-driver/src/index.ts#L159-L238)

结束分类也保留语义：blocked 映射 refusal，max-tokens 单独保留；无明确结算记录默认 error。取消可以保留 partial output，已经 recorded completed 的结果不会因稍后设置 cancelled 就一律改成 aborted。结构化输出则有额外要求：普通 completed 但没有捕获到结构化值，会转成 error 或相应取消结果，不能把“模型结束”当成“交付满足 schema”。

结果 Promise 与 disposer 是两个通道。run.dispose 会同时等待 handle.dispose 和 result，result fault 由结果通道负责，disposer 只报告资源释放失败；底层 handle 负责 cancel、whenIdle、scope、持久化 handle close 和注销。one-shot background 的 `settleRun` 再把两者合起来：先取得结果，再 dispose，清理失败也使 Job failed，双重失败都保留原因。[结果后的资源结算](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent/src/run-settlement.ts#L28-L75)

局部实验明确验证：子结果已 ready，但 cleanup 仍阻塞时 Job 不结算；即使子结果 completed，dispose 抛错也不会显示 Job completed。它测试原始 settleRun 配 fixture run，不是完整 child driver 的生命周期验收。

continuable child 则走另一套 manager：创建前取得 parent ownership hold，在 await 之后重查准入，按 child ID 加锁，保存元数据并投递消息，返回 childId/messageId。它承担后续消息和冷恢复，不返回每条消息一个 one-shot Job 结果。把这种长期身份塞进“一次 spawn、一次 await”的接口，会把结果结束与身份销毁错误合并。[可继续子任务入口](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent/src/continuation.ts#L100-L190)

## Grok：先接纳初始 prompt，再完成 pending 到 active 的 promotion

Grok 的 `wait_initial_child_prompt_readiness` 同时等待取消、readiness ack、attempt result 和 admission deadline，`tokio::select!` 使用 biased，顺序明确为取消优先、成功 ack、已结束 attempt、最后期限。当这些状态同一时刻 ready，结果不是任意竞速。readiness 还带回一个 release sender，表示子方已到达接纳边界，但仍需要发布侧放行。[初始接纳仲裁](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/attempt_runner.rs#L1-L40)

<!-- harness-diagram:08-grok -->

<figure class="article-figure"><a href="/images/agent-harness/08/08-grok.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Grok：未 promotion 时，先等退出再决定删资源"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/08/08-grok-mobile.svg"><img src="/images/agent-harness/08/08-grok.svg" alt="Grok：未 promotion 时，先等退出再决定删资源" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 08 · Grok Build：宁可保留仍被活进程占用的工作区，也不假装资源已经回收。*

图示依据：[G08d](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/mod.rs#L1908-L1958)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

`handle_request` 取得 ack 后创建 `StartedChild` 与 `ShellChildRuntime`，调用 reporter.started 或 started_deferred。promotion 失败就丢弃 release；成功并完成相应发布步骤后才发送 release。wake 路径还有 deferred start 的提交/撤销，不应把它与全新 child 简化成同一条无条件继续执行的路径。[promotion 与 release](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/handle_request.rs#L1700-L1841)

控制句柄包含 command sender、message delivery、signals 和可选 SessionThread。promotion 还没完成时，调用方仍持有 thread handle，`ShellChildRuntime` 中暂为 None；这样失败方保留了等待 actor 退出的能力，避免把唯一的退出等待责任交给尚未成功注册的 owner。

若未 promotion，`cancel_pending_shell_child` 发出 turn cancel 和 graceful shutdown，最多等配置边界内的线程退出。这里的默认等待上限为 5 秒。确认退出，才结束 workspace binding，并且只删除本次 freshly created 的 worktree；已有 worktree 不因一次失败创建就被清走。[未发布子任务回收](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/mod.rs#L1908-L1958)

超时但线程仍存活时，函数保留工作区和 binding，并记录 warning 后返回相应 cancelled/timeout result。因此，这个终止结果仍需和资源是否释放分开解释。对比 Pi 示例取消时误读 killed 标记，这里使用的是 `SessionThread::is_finished` 的实际退出观察。不过本文没有运行 Grok actor，5 秒边界也不是“所有子任务停止的端到端 SLA”。[退出证据与资源去留](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/child_runtime.rs#L93-L145)

父任务的结束同样需要读具体条件。已读的 turn 收尾只在 Cancelled 或 MaxTurnsReached 时调用 `cancel_running_turn_subagents(prompt_id)`，不能从函数名推断任何正常完成或任何错误都会执行同样的批量取消。后台定义、活动消息和子任务注册的生命周期，仍由对应 coordinator 持有。[父 turn 的取消条件](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/session/acp_session_impl/turn.rs#L1375-L1383)

## 用同一张表检查五种“完成”

| 边界 | Codex | Pi 示例 | DeepSeek | Grok |
|---|---|---|---|---|
| 配置何时确定 | live turn 配置与角色覆盖后 | Agent 定义与 dispatch defaults | 首个 await 前捕获策略 | 构造 child runtime 与请求配置 |
| 可见身份与开始工作 | thread 注册可早于首条输入成功 | 直接启动进程并读事件 | 未发布 setup 后 publish，再 followup | readiness 与 reporter promotion 之间有 release 门 |
| 结果是否包含清理 | close 与 previous_status 分开 | 正常返回等待 close；取消路径有缺口 | run.result 分开；settleRun 等 dispose | 未 promotion 可返回终止结果但保留资源 |
| 工作区是否独立 | 此默认配置路径继承 cwd | 默认共享父 cwd | session/工具隔离不等于目录隔离 | 可选 worktree，删除受来源与退出证据约束 |

2026-09-13 的[子任务实验](/downloads/agent-harness/08/content/experiments/subagent-lab.ts)共 7 组：Pi 4 组，DeepSeek 3 组。它们包括一个真实存活子进程的取消反例，PASS 表示反例被成功观察并清理，不表示该取消实现通过可靠性验收。原有双进程取消演示继续保留，但不能用它代替项目相关代码的证据。

我的设计判断是，委派接口应同时给出工作身份、执行控制和资源所有权，而不是只返回一段子 Agent 文本。接纳、发布、执行和清理各自可能失败；重试与回滚必须根据所在边界决定。对于共享工作区，仍需真实的隔离、互斥或合并策略；对模型说“小心不要覆盖”不能解决并发写入。下一篇继续看客户端如何承接这些状态，避免把“请求已接纳”显示成“任务已完成”。

<!-- harness-diagram:08-summary -->

<figure class="article-figure"><a href="/images/agent-harness/08/08-summary.svg" target="_blank" rel="noopener" aria-label="查看完整配图：创建、接纳、结果、结算与退出分开观察"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/08/08-summary-mobile.svg"><img src="/images/agent-harness/08/08-summary.svg" alt="创建、接纳、结果、结算与退出分开观察" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 08 · 本篇总结：有子任务 ID 不证明首条任务成功；有输出也不证明资源已回收。*

图示依据：[C08e](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/core/src/agent/control/spawn.rs#L723-L810)、[P08e](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/examples/extensions/subagent/index.ts#L397-L439)、[D08g](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/subagent/subagent/src/run-settlement.ts#L28-L75)、[G08d](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/subagent/mod.rs#L1908-L1958)。跨实现比较 · 根据本篇已引源码与明确的实验范围。

<!-- /harness-diagram -->

## 配套材料

[阅读实验说明](/agent-harness/08-evidence/) · [阅读复现入口](/agent-harness/08-reproduce/) · [下载正文、原图与实验材料](/downloads/agent-harness/08/agent-harness-08.zip)（[SHA-256](/downloads/agent-harness/08/agent-harness-08.zip.sha256)）。

下载包保留本篇最终正文、6 张原图、固定版本记录及实验源码；不含上游源码或依赖。复现实验需要联网准备环境，既有实验边界见说明。

<!-- harness-series-nav -->

## 系列阅读

[上一篇：多个 Hook 如何协作？四种 Harness 的扩展与卸载](/agent-harness/07-extensions/) · [下一篇：界面显示已完成时，Harness 承诺了什么？](/agent-harness/09-clients/)

<!-- /harness-series-nav -->
