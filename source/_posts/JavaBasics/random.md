---
title: Random与ThreadLocalRandom
categories:
  - [Java Basics]
tags:
  - [Java]
  - [Random]

---

# 前言

- `ThreadLocalRandom` 和 `Random` 类都是 Java 中用于生成随机数的类，但它们有一些区别和不同的使用场景

<!--more-->



# 竞争与性能

## Random

1. `Random` 类是**线程安全**的，可以在多个线程中共享使用
2. 但是，在**多线程环境**下，由于 `Random` 类使用了同一个种子生成随机数序列，可能会导致竞争条件和性能问题
    - **竞争条件**：如果多个线程同时使用同一个 `Random` 对象并且种子相同，它们将**竞争生成随机数序列的访问权**。这可能导致多个线程同时尝试修改或读取随机数序列，从而导致竞争条件和不确定的结果
    - **性能问题**：当多个线程同时使用同一个 `Random` 对象时，它们需要进行**同步操作以确保线程安全**。这涉及到锁定机制，会引入额外的开销和延迟，从而降低性能

## ThreadLoacalRandom

1. `ThreadLocalRandom` 类是 Java 7中引入的，它提供了一种**更高效且线程安全**的随机数生成方式
2. 每个线程都有自己的 `ThreadLocalRandom` 实例，**避免了多线程竞争问题**，即避免多个线程同时访问同一个随机数生成器实例时的竞争，比使用同步机制的 `Random` 类在多线程环境下更高效
3. `ThreadLocalRandom` 的高性能主要体现在以下几个方面：
    - **无锁设计**：`ThreadLocalRandom` 使用了无锁设计，避免了多线程竞争的开销，提高了性能
    - **基于线程的随机数生成器**：每个线程都有自己的随机数生成器实例，避免了线程间的竞争，提高了并发性能
    - **使用高效的算法**：`ThreadLocalRandom` 使用了高效的随机数生成算法，例如 XorShift 算法，这些算法具有良好的性能和随机性
    - **缓存数据**：`ThreadLocalRandom` 在每个线程中缓存了一些随机数，减少了每次生成随机数时的开销



# 使用方式

## Random

- 通过创建 `Random` 实例，然后调用其方法生成随机数

```java
Random random = new Random();
int randomNumber = random.nextInt(100); // 生成0到99之间的随机整数
```

## ThreadLoacalRandom

- 直接通过静态方法调用生成随机数

```java
int randomNumber = ThreadLocalRandom.current().nextInt(100); // 生成0到99之间的随机整数
```



# 总结

- 一般来说，如果在**单线程**环境中使用随机数，可以选择使用 `Random` 类
- 而在**多线程**环境中，为了避免竞争条件和性能问题，建议使用 `ThreadLocalRandom` 类