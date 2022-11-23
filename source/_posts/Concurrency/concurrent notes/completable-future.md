---
title: CompletableFuture
categories:
  - [Concurrency]
tags:
  - [Concurrency]
  - [CompletableFuture]
  - [Future]
---



# Future 不足之处





<!--more-->



# CompletableFuture

![completable-future](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/completable-future.png)

## CompletionStage

- 代表异步计算过程中的某一个阶段，一个阶段完成以后**可能会触发**另外一个阶段
- 一个阶段的计算执行可以是一个 `Funtion`，`Consumer` 或者 `Runnable`
  - 比如：`stage.thenApply(x -> square(x)).thenAccept(x -> System.out.print(x)).thenRun(() -> System.out.println())`
- 一个阶段的执行可能是被单个阶段的完成触发，也可能是由多个阶段一起出发