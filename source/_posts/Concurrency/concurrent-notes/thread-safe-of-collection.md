---
title: 集合的线程安全
categories:
  - [Concurrency]
tags:
  - [Concurrency]
---


# 快速失败

- `java.util`下的集合都是快速失败的
- 集合的遍历是通过迭代器实现的，迭代器迭代时会检查`modCount == expectedModCount`，如果进行并发修改，可能导致`modCount != expectedModCount`，导致并发修改异常
- 如`ArrayList`

<!--more-->

# 安全失败

- `JUC`下的集合是安全失败的
- 迭代器遍历的是原集合的副本，所以对集合进行并发操作，不会发生`modCount != expectedModCount`，但是在遍历时不会读到新修改的值，即牺牲了读正确性



# 解决集合的线程不安全

## 对于`ArrayList`

  - `Vector`（不推荐使用，性能低）
  - `Collections`包装，得到线程安全集合，如`Collections.synchronizedList()`（不推荐使用，性能低）
  - `CopyOnWriteArrayList`，利用写时复制技术（推荐使用，但会牺牲读正确性）

## 对于`HashSet`

- `CopyOnWriteArraySet`

## 对于`HashMap`

- `ConcurrentHashMap`



# `CopyOnWriteArrayList`

> [CopyOnWriteArrayList原理，优缺点，使用场景](https://blog.csdn.net/u010002184/article/details/90452918)
