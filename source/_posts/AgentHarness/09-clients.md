---
title: "界面显示已完成时，Harness 承诺了什么？"
description: "请求成功、运行结束和客户端看到结果，是不同的确认。比较四种 Harness 的应答、输出背压与断连处理，解释为什么超时不等于任务取消，收到通知也不等于状态已经应用。"
intro: "断连后看不到结果，能否直接重新提交？本文沿四条协议路径区分接纳、执行和观察，结合传输层与输出模块实验，分析客户端怎样避免把未知状态显示为失败或完成。"
kind: article
card_wrap: words
card_title_lines: ["界面显示已完成时，", "Harness 承诺了什么？"]
published: true
categories: [Agent Harness]
tags: ["Agent Harness", "源码阅读", "Coding Agent"]
date: 2026-09-14
updated: 2026-09-14
permalink: agent-harness/09-clients/
related: ["agent-harness/08-subagents/", "agent-harness/10-observability/"]
---

<figure class="article-figure"><a href="/images/agent-harness/09/09.svg" target="_blank" rel="noopener" aria-label="查看完整配图：客户端与运行时协议：请求接纳与任务完成不能合并"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/09/09-mobile.svg"><img src="/images/agent-harness/09/09.svg" alt="客户端与运行时协议：请求接纳与任务完成不能合并" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

设想一个故障：用户提交修改请求，界面收到成功响应；随后网络断开。用户重连后看不到结果，于是再点一次。第一次到底没有开始、仍在运行，还是已经修改文件但通知丢了？若服务端只提供一个 `success`，这三个状态会被压成同一种界面表现，客户端只能猜。

理解故障时，还需要说明每个 JSON-RPC 应答具体承诺了什么。需要沿着“输入接纳→运行→结果生成→资源结算→传输→客户端应用”逐段找所有者。本篇据[固定提交](/downloads/agent-harness/09/content/evidence/versions.json)审读四条实际路径；2026-09-13 的局部实验执行原始传输模块和输出模块，未运行完整 App Server、SDK 子进程或四产品断连重连。

> 版本与证据：源码基线固定于 2026-09-12，实验记录来自 2026-09-12 至 13 日；本文于 2026-09-14 润色，未重新执行实验。源码事实、局部实验观察与设计判断分别表述，不代表四产品端到端验收。详见[本篇实验说明](/agent-harness/09-evidence/)。


延伸阅读：本篇区分接纳、执行终态与观察者确认。已有任务身份之后，断连重连仍要解决快照与增量交错、历史分页和完成通知丢失，见[第 12 篇：四个 Harness 的状态同步与事件恢复](https://aresning.github.io/agent-harness/12-client-recovery/)。

## 一、四种确认分别发生在什么时候

第一种是传输确认：字节已交给本地输出设施。第二种是接纳确认：请求经过校验，进入运行时可处理的队列。第三种是执行终态：这一轮不再继续采样。第四种是观察者确认：客户端已经应用了哪个版本的状态。

它们通常存在因果关系，却不必共用一个响应。后台任务可以先返回身份，之后发终态事件；长请求可以一直等到终态才返回；本地写回调完成也没有证明对端已读，更没有证明 UI 已渲染。把总耗时都叫作“模型延迟”，会把输出阻塞、上传等待乃至插件弹窗算到模型身上。

| 固定版本入口 | 正常响应对应的边界 | 仍不能推出什么 |
|---|---|---|
| Codex `turn/start` | core 返回 Started 或 Steered 的目标 turn | 新建了一轮、该轮已完成、界面已应用所有 item |
| Pi RPC `prompt` | `preflightResult` 报告预检成功 | 后续模型/工具成功、Agent 已 settled |
| DeepSeek SDK `session/prompt` | live agent 收到 followup，返回 messageId | 每个 prompt 独立产生终态、已经 flush 到稳定存储 |
| Grok ACP `session/prompt` | 普通路径等 Actor 回复，再完成相应收尾 | EndTurn 必定执行了模型、所有通知已被客户端消费 |

下文按实际分支解释这四种返回契约。

## 二、Codex：`turn/start` 可以变成 steer，返回体也是特定时刻的投影

App Server 把输入转成 `TurnInput`，构造环境与线程设置覆盖，再调用 `start_or_steer_turn`。这个调用有三个结果：Started、Steered、NotSubmitted。前两者都继续构造响应；第三者区分 ServerDraining 和其他拒绝原因后返回错误。因此客户端不能依据方法名给每次 `turn/start` 都创建一个新 turn：已有活动轮次时，接纳可能属于已有 turn。[输入提交与返回分支](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/app-server/src/request_processors/turn_processor.rs#L595-L714)

<!-- harness-diagram:09-codex -->

<figure class="article-figure"><a href="/images/agent-harness/09/09-codex.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Codex：慢消费者的处理取决于连接能力"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/09/09-codex-mobile.svg"><img src="/images/agent-harness/09/09-codex.svg" alt="Codex：慢消费者的处理取决于连接能力" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 09 · Codex：断开连接不等于统一中断仍由 core 持有的 turn。*

图示依据：[C09c](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/app-server/src/transport.rs#L140-L186)、[C09e](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/app-server/src/request_processors/thread_processor.rs#L3508-L3521)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

返回的 `Turn` 明确设置 `items: []`、`items_view: NotLoaded`、`status: InProgress`，时间字段为空。这是接纳应答的构造方式，不是对真实历史执行了一次全量读取。“没有 items”不能解释为没有执行，“InProgress”也不能当作收到响应那一刻的强一致查询结果：接纳后 core 与传输继续并发推进。[同一返回构造](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/app-server/src/request_processors/turn_processor.rs#L595-L714)

对客户端的设计判断是：用返回的 turn ID 关联事件和状态，而不是用响应到达顺序推导生命周期。一个很快完成的任务可能在客户端处理接纳响应前已有后续事件；本篇没有运行该竞争，但源码中接纳后构造响应与独立运行的边界，足以要求客户端避免依赖未经保证的顺序。

输出侧更能体现 App Server 的所有权选择。可断开的连接使用有界 writer 队列的 `try_send`；满队列就移除连接并请求断开。没有这种断连能力的输出路径使用 `send(...).await`，等待队列腾出空间。前者把慢消费者隔离出去，后者把压力传回发送链。它们不能被概括成“Codex 有背压所以不会丢状态”。队列边界保住了服务端资源，同时要求被断开的客户端重新建立视图。[两种队列策略](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/app-server/src/transport.rs#L140-L186)

断连也不是统一的任务取消。总处理器先关闭该连接的 RPC 准入、清理反向用户验证，限时等待已在执行的 RPC，再分别清理文件、命令、进程和线程资源。线程处理器移除连接关系，只有 core 中线程已不存在时才清理残留 bookkeeping；这个函数没有对仍存活线程统一提交 Interrupt。连接拥有的请求资源与 core 拥有的任务，生命周期由不同处理器决定。[总清理链](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/app-server/src/message_processor.rs#L856-L889) [线程侧清理](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/app-server/src/request_processors/thread_processor.rs#L3508-L3521)

这支持一个有界结论：不能拿 WebSocket 断开等同于 turn 被撤销。它不意味着进程退出、stdio EOF 或所有退出路径都保留任务；这些需要分别追踪服务器生命周期。

## 三、Pi：预检应答很早，输出等待却可以很深

Pi RPC 在 `prompt` 分支启动 `session.prompt`，通过 `preflightResult` 回调发送成功或错误。外层调用没有等整个 prompt 完成才返回给命令处理器。预检成功后，后续 promise 拒绝不会再补发同一个 command 的错误应答；客户端应通过运行事件理解之后的失败，不能等一个“最终 RPC response”覆盖早先成功。[prompt 分支](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L350-L430)

<!-- harness-diagram:09-pi -->

<figure class="article-figure"><a href="/images/agent-harness/09/09-pi.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Pi：输出屏障等待的是会增长的 tail"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/09/09-pi-mobile.svg"><img src="/images/agent-harness/09/09-pi.svg" alt="Pi：输出屏障等待的是会增长的 tail" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 09 · Pi：等待 A 时加入 B，释放 A 之后仍要继续等 B。*

图示依据：[P09b](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/output-guard.ts#L1-L107)。原 output-guard + 可控写回调实测。

<!-- /harness-diagram -->

另外两条订阅负责不同事情：session 事件投影为 JSON 行输出，Agent 的异步订阅则等待 stdout 背压，即下游输出缓慢时，让上游等待。看似单向的日志发送因此接入了执行等待链。01 篇已经实测 `agent_end` 订阅者没释放时调用不能结算；这里的源码解释了一个真实用途——Agent 必须给消费端跟上的机会，而不是无限推进事件生产。[订阅与背压](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L350-L430)

`output-guard` 并非简单检查 `write()` 的布尔返回值。它把每次输出挂到一个 promise tail，前一块写回调成功后才开始下一块。`waitForRawStdoutBackpressure` 先捕获当前 tail，等待后再比较 tail 是否改变；改变就继续等。因此等待期间新增的输出也会延长屏障。

这有两个代价。其一，慢写回调可以让运行结算变慢；其二，其他来源持续增加输出时，等待者未必只等自己进入前的那一批。队列在这个模块没有显式容量上限，是否有界要结合生产者是否等待来看。ENOBUFS、EAGAIN、EWOULDBLOCK 会延迟 10 ms 后重试同一块；这里没有重试次数上限。永久不可恢复写错误则走退出路径。[串行写入与增长屏障](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/output-guard.ts#L1-L107)

反向 UI 请求进一步说明“一个 prompt 一个串行 RPC handler”为什么不成立。弹窗把 ID 放进 pending map，响应、超时、abort 都负责删除；confirm 的默认结果为 false。输入读取器逐行调用 `void handleInputLine(line)`，不会等上一行异步处理结束才派发下一行。这样 prompt 等扩展 UI 时，响应行仍可进入并解除等待。这个机制避免一类死锁，也意味着多条命令可以交错，不能把 JSONL 行序误认为业务事务串行。[弹窗生命周期](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L90-L137) [逐行分发](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L726-L813)

关闭路径先取消事件与背压订阅，再 dispose runtime host、移除输入、暂停 stdin；普通退出等待输出 flush，SIGTERM 路径跳过这一等待。由此不能把所有退出都解释成“最后一个事件一定已交付”。反向请求是否都在宿主 dispose 内完成回收，本篇未继续追到全部扩展，不依据一个 pending map 宣称整体无泄漏。[shutdown](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/modes/rpc/rpc-mode.ts#L726-L813)

## 四、DeepSeek：超时是放弃等候，不是向运行时发送取消

SDK server 的 `prompt` 在提交输入前执行两次 live 校验。拿到 session record 后先验证其中 agent 仍是注册表中的同一实例；图片等内容进入附件设施是异步边界，返回后再验证一次，随后创建用户消息并调用 `followup`，最终返回 `{messageId}`。这防止 Agent Loop 热重载后旧句柄仍能静默接纳消息，也防止附件处理期间句柄失效。[双校验与入队](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/server/src/server.ts#L175-L260)

<!-- harness-diagram:09-deepseek -->

<figure class="article-figure"><a href="/images/agent-harness/09/09-deepseek.svg" target="_blank" rel="noopener" aria-label="查看完整配图：DeepSeek：客户端超时，只放弃本地等待"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/09/09-deepseek-mobile.svg"><img src="/images/agent-harness/09/09-deepseek.svg" alt="DeepSeek：客户端超时，只放弃本地等待" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 09 · DeepSeek：没有 cancel 帧，已进入的服务端 handler 仍可产生副作用。*

图示依据：[D09d](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/client/src/client.ts#L286-L341)、[D09e](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/protocol/src/transport.ts#L66-L267)。原 transport + 内存 byte stream 实测。

<!-- /harness-diagram -->

并发创建则由 `sessionCreations` 保存同一 session ID 的创建 promise，后来的请求复用它。这种合并同一创建工作的方式称为 singleflight。shutdown 先阻止新创建，再等待已开始的创建 settle，随后收集实例并 dispose；这解决的是服务器对资源的持有，不是把每次 prompt 改造成等待执行结束的事务。[创建 singleflight](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/server/src/server.ts#L263-L297) [shutdown](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/server/src/server.ts#L175-L260)

普通 prompt 返回的是 messageId；`max-tokens` 等终态的映射用于构造子 Agent 完成通知，不能移植成普通 prompt 的返回契约。客户端 `prompt` 也只检查 messageId 为字符串并返回，未等待模型结算。[客户端实际校验](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/client/src/client.ts#L286-L341)

timeout 还会引入另一种容易混淆的状态。SDK client 的定时器 abort 一个本地 signal；transport 删除对应 pending entry 并 reject。它没有发送 cancel 帧。服务端 handler 如果已经开始，仍可产生副作用；迟到响应到来时查不到 pending entry，就被忽略。因而“请求超时→自动重试”会产生重复执行风险，即使 JSON-RPC request ID 本身从不重复。[timeout 实现](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/client/src/client.ts#L286-L341) [pending 和迟到响应处理](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/protocol/src/transport.ts#L66-L267)

`close()` 同样有层级：底层 transport close 只移除输入监听并拒绝 pending requests，不销毁调用者持有的 streams。不能拿它代替 SDK runtime client 的进程关闭流程。订阅对象还有一个有意的差别：运行时死亡通过 fail 标记错误，已交付的队列仍可先读完；用户主动 close 订阅会清空队列并立即失败。两种“关闭”服务于保留最终证据和主动放弃观察两种不同意图。[transport close](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/protocol/src/transport.ts#L66-L267) [订阅队列](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/client/src/client.ts#L98-L163)

通知入队和 request ID 只解决本连接内的分发。这里没有观察者已应用序号、持久重放游标或跨连接幂等提交证明。本篇只审计这些 SDK 路径，不据此宣称整个 DeepSeek 所有入口都没有恢复能力。

## 五、Grok：长请求等终态，但终态响应仍不等于所有交付完成

Grok 的 ACP prompt 在普通路径里创建 oneshot channel，把 `respond_to` 随 prompt 交给 SessionActor。`sendNow` 直接发 Prompt 命令，普通路径走 human delivery 队列；分发成功后显式释放 dispatch lock，再等待 receiver。这把“有序分发”和“等待长任务”分开：锁保护分发阶段，不把整轮采样串进同一把锁。[两条入口与等待点](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L1325-L1469)

<!-- harness-diagram:09-grok -->

<figure class="article-figure"><a href="/images/agent-harness/09/09-grok.svg" target="_blank" rel="noopener" aria-label="查看完整配图：Grok：Actor 终态之后，协议入口仍有工作"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/09/09-grok-mobile.svg"><img src="/images/agent-harness/09/09-grok.svg" alt="Grok：Actor 终态之后，协议入口仍有工作" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 09 · Grok Build：prompt_complete 发起发送，不代表对端已经消费所有状态。*

图示依据：[G09b](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L1325-L1469)、[G09c](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L1473-L1575)、[G09d](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L1620-L1722)。固定版本源码示意；省略的条件与实验边界见本节正文。

<!-- /harness-diagram -->

Actor 回复之后还没立刻返回。代码读取 usage、准备取消元数据，发送 `x.ai/session/prompt_complete` 的 fire-and-forget 通知，更新 roster，收集 trace；后续根据上传策略等待归档或把收尾交给后台，再构造 ACP PromptResponse。通知发起、响应生成、归档完成是三个位置；fire-and-forget 本身不提供客户端应用确认。[终态后的通知](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L1473-L1575) [上传策略与响应](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L1620-L1722)

所以两种客户端都可能误判：只等 response，会把收尾耗时算进 Agent 的执行时间；只看 prompt_complete，就可能把尚未完成的后续收尾当作已经交付。具体需展示哪个状态取决于产品需求，协议适配器应保留边界，而不是把所有时间折成一个 duration。

连 StopReason 也不能单独解释业务成功：模型 allowlist 全排除的早退分支会先发模型提示，然后返回 ACP EndTurn，并没有经过正常 Actor 采样链。移出等待队列的 prompt 则有专门的 Cancelled 响应与 completion metadata。客户端必须结合业务通知和原因字段；“RPC 没报错”只证明方法按协议返回。[未执行模型的 EndTurn](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L985-L1023) [移出队列分支](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L1325-L1469)

本篇没有追完整个 Grok gateway 的断连退出链，也没有验证每种通知最终发送到网络的次序。长请求中 receiver 被关闭会转成内部错误，这仍不能单独证明 Actor 的外部副作用没有发生。

## 六、五个原模块实验，专门区分竞争假设

2026-09-13 的[实验与结果](/downloads/agent-harness/09/content/evidence/clients-results.json)直接 bundle 固定源码中的 DeepSeek `JsonRpcLineTransport` 和 Pi `output-guard`，前者接两条内存字节流，后者只替换 stdout 回调。完整产品服务器、真实网络和 UI 都不在被测范围。

1. 阻塞先到的 slow handler，后到的 fast handler 先响应；两者结果仍按 request ID 正确归属，通知可穿插。证明逐行读入不是 handler 串行执行。
2. 请求开始后 abort 客户端等待，再释放服务端闸门。客户端先报错，服务端副作用计数仍变成 1。证明放弃本地等待（abandonment）不等于远端取消。
3. close 客户端 transport 后，pending request 拒绝、两条 stream 未销毁，已进入的服务端 handler 继续结束。证明通信对象与宿主资源的所有权不同。
4. Pi 开始等 A 的写回调后又加入 B；释放 A 仍不能结束屏障，必须继续释放 B。证明它等待会增长的 tail，而非进入时的固定快照。
5. 第一次写回调返回 EAGAIN，随后成功；观察到同一 frame 写入两次尝试。证明短暂资源错误的恢复点在块写入层，不是重新运行 Agent。

五项均通过，意味着观察与断言吻合，不意味着四套客户端可靠性已经验收。原有独立断线演示展示事件去重的思路，不能充当任何上游重连协议的证据。

## 七、客户端需要保留哪些状态与身份

设计判断是把提交身份、运行身份、事件身份分开保存：request ID 关联一次方法调用，message/turn ID 关联运行对象，事件版本才用于重建视图。不要因为请求 promise reject 就删除任务，也不要用相同请求内容判断是否为重复提交。

对慢消费者必须说明策略：阻塞生产、断开连接或丢弃投影，各自需要不同的界面恢复路径。状态快照能回答“现在是什么”，未必能回答“我断线期间发生过什么”；事件回放能补历史，也仍需处理重复与缺口。跨连接 exactly-once 需要提交去重、持久化和对端应用确认共同支撑，不能由一个 JSON-RPC ID 推导出来。

下一篇讨论如何留下能区分这些状态的观测证据。否则，即使运行时已经正确拆开了边界，监控仍可能把预检成功算为任务成功，把客户端超时算为工具失败，把本地 flush 算为数据已抵达服务端。

<!-- harness-diagram:09-summary -->

<figure class="article-figure"><a href="/images/agent-harness/09/09-summary.svg" target="_blank" rel="noopener" aria-label="查看完整配图：请求返回值只承诺所在阶段"><picture><source media="(max-width: 600px)" srcset="/images/agent-harness/09/09-summary-mobile.svg"><img src="/images/agent-harness/09/09-summary.svg" alt="请求返回值只承诺所在阶段" loading="lazy"></picture></a><figcaption>点击查看完整配图</figcaption></figure>

*图 09 · 本篇总结：客户端应保存请求身份和运行身份；超时、断连与取消不能互相替代。*

图示依据：[C09c](https://github.com/openai/codex/blob/c4017a87aacc7558002b7cb510025e967c1d765e/codex-rs/app-server/src/transport.rs#L140-L186)、[P09b](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/src/core/output-guard.ts#L1-L107)、[D09d](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/sdk/client/src/client.ts#L286-L341)、[G09b](https://github.com/xai-org/grok-build/blob/37949780c144e37df692e3d669051a21fec24f20/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L1325-L1469)。跨实现比较 · 根据本篇已引源码与明确的实验范围。

<!-- /harness-diagram -->

## 配套材料

[阅读实验说明](/agent-harness/09-evidence/) · [阅读复现入口](/agent-harness/09-reproduce/) · [下载正文、原图与实验材料](/downloads/agent-harness/09/agent-harness-09.zip)（[SHA-256](/downloads/agent-harness/09/agent-harness-09.zip.sha256)）。

下载包保留本篇最终正文、6 张原图、固定版本记录及实验源码；不含上游源码或依赖。复现实验需要联网准备环境，既有实验边界见说明。

<!-- harness-series-nav -->

## 系列阅读

[上一篇：子 Agent 何时才算结束？创建、接纳与资源回收](/agent-harness/08-subagents/) · [下一篇：测试通过证明了什么？Harness 的观测证据与评分分母](/agent-harness/10-observability/)

<!-- /harness-series-nav -->
