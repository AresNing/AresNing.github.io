---
title: CAS
categories:
  - [Concurrency]
tags:
  - [Concurrency]
  - [CAS]
  - [Unsafe]
  - [atomic]
---



# 原理

- CAS 是 JDK 提供的非阻塞原子性操作，其通过硬件保证了比较-更新的原子性
- 实现方法：通过`Unsafe`提供的 CAS 方法（`compareAndSwapXxx`），底层实现是基于硬件平台的汇编指令，在 intel 的 CPU 中（x86机器上），使用的是汇编指令`cmpxchg`指令
- 核心思想：比较要更新变量的值`V`和预期值`E`（compare），相等才会将`V`的值设为新值`N`（swap），如果不相等则自旋
- 比起用`synchronized`重量级锁，CAS 的排他时间要短很多，因此在多线程情况下性能会比较好

<!--more-->



# 源码分析

> 以`AtomicInteger`为例

![atomic-integer](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/atomic-integer.png)

## Unsafe

- `Unsafe`是 CAS 的核心类，由于 Java 方法无法直接访问底层系统，需要通过本地（native）方法来访问，`Unsafe`相当于一个后门，基于该类可以直接操作特定内存的数据
- `unsafe`类存在于`sun.misc`包，其内部方法操作可以像C指针一样直接操作内存，因此 Java 中 CAS 操作的执行依赖于`Unsafe`类的方法
- `Unsafe`类中的所有方法都是由`native`修饰，即`Unsafe`类中的方法都直接调用操作系统底层资源执行相应任务

## valueOffset

- 表示该变量值在内存中的偏移地址，因为`Unsafe`就是根据内存偏移地址获取数据的

## value

- `value`用`volatile`修饰，保证了多线程之间的内存可见性

## 线程安全的i++

- `i++`是线程不安全的，应使用`atomicInteger.getAndIncrement()`
- `AtomicInteger`类主要利用 CAS + `volatile`保证可见性和有序性，`native`方法保证原子性



# 缺点

- 长时间自旋操作占用CPU资源
- `ABA`问题
  - 版本号解决，`AtomicStampedReference`