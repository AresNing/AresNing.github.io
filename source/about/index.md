---
title: 关于
date: 2022-10-15 21:37:04
type: "about"
layout: "about"
---

我是 AresNing，关注 Agent 系统与 Harness 的设计和实现。

我通过源码阅读和局部实验，理解 Agent 如何组织模型调用、使用工具、管理上下文，以及在中断或失败后恢复执行。希望把实现背后的责任边界与设计取舍写清楚。

这里也保留 Java、并发编程和代码可读性的学习笔记。文章会区分源码支持的结论、实际运行的观察和个人的设计思考，并保留引用与实验范围。

## 从这里开始

- [一次 Agent 任务经过哪些层？从四种 Harness 看责任边界](/agent-harness/00-overview/)
- [Agent 的一轮何时结束？四种 Harness 的执行边界](/agent-harness/01-turn-boundaries/)
- [从四种 Harness 到自己的设计：用离线查看器检验取舍](/agent-harness/11-design/)

## 代码与联系

你可以在 [GitHub](https://github.com/AresNing) 查看我的公开代码，也可以通过这个[博客的源码仓库](https://github.com/AresNing/AresNing.github.io)了解本站的实现。
