---
title: 线程池
categories:
  - [Concurrency]
tags:
  - [Concurrency]
  - [Thread Pool]
---



# 线程池框架

- Java 中的线程池是通过`Executor`框架实现的

![thread-pool-framework](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/thread-pool-framework.png)

<!--more-->

# 线程池参数

> **创建线程池推荐适用`ThreadPoolExecutor`及其 7 个参数手动创建**

- `corePoolSize`：线程池的核心线程数
- `maximumPoolSize`：能容纳的最大线程数
- `keepAliveTime`：空闲线程存活时间
- `unit`：存活的时间单位
- `workQueue`：存放提交但未执行任务的队列
- `threadFactory`：创建线程的工厂类
- `handler`：等待队列满后的拒绝策略

> 当提交的任务数大于（`workQueue.size()`+`maximumPoolSize`），就会触发线程池的拒绝策略

```java
public static void main(String[] args) {
    // 创建线程池
    ExecutorService threadPoolExecutor = new ThreadPoolExecutor(
        3,  // corePoolSize
        5,  // maximumPoolSize
        10,  // keepAliveTime
        TimeUnit.MICROSECONDS,  // unit
        new ArrayBlockingQueue<>(3),  // workQueue
        Executors.defaultThreadFactory(),  // threadFactory
        new ThreadPoolExecutor.AbortPolicy());  // handler

    try {
        for (int i = 0; i < 10; i++) {
            // 执行任务
            threadPoolExecutor.execute(() -> {
                System.out.println(Thread.currentThread().getName() + "execute...");
            });
        }
    } catch (Exception e) {
        e.printStackTrace();
    } finally {
        // 关闭线程池
        threadPoolExecutor.shutdown();
    }
}
```





# 拒绝策略

- `CallerRunsPolicy`：当触发拒绝策略，只要线程池没有关闭的话，则使用调用线程直接运行任务。一般并发比较小，性能要求不高，不允许失败。但是，由于调用者自己运行任务，如果任务提交速度过快，可能导致程序阻塞，性能效率上必然的损失较大
- `AbortPolicy`：丢弃任务，并抛出拒绝执行`RejectedExecutionException`异常 信息。线程池默认的拒绝策略。必须处理好抛出的异常，否则会打断当前的执行流程，影响后续的任务执行
- `DiscardPolicy`：直接丢弃，无其他处理
- `DiscardOldestPolicy`：当触发拒绝策略，只要线程池没有关闭的话，丢弃阻塞队列`workQueue`中最老的一个任务，并将新任务加入



# 线程池底层工作原理

1. 在创建了线程池后，线程池中的线程数为零
2. 当调用`execute()`方法添加一个请求任务时，线程池会做出如下判断：
   - 如果正在运行的线程数量小于`corePoolSize`，那么马上创建线程运行这个任务
   - 如果正在运行的线程数量大于或等于`corePoolSize`，那么将这个任务放入队列
   - 如果这个时候队列满了且正在运行的线程数量还小于`maximumPoolSize`，那么还是要创建非核心线程立刻运行这个任务
   - 如果队列满了且正在运行的线程数量大于或等于`maximumPoolSize`，那么线程池会启动饱和拒绝策略来执行 
3. 当一个线程完成任务时，它会从队列中取下一个任务来执行
4.  当一个线程无事可做超过一定的时间（`keepAliveTime`）时，线程会判断：
  - 如果当前运行的线程数大于`corePoolSize`，那么这个线程就被停掉
  - 所以线程池的所有任务完成后，它最终会收缩到`corePoolSize`的大小



# 注意

> 阿里巴巴 Java 开发手册
>
> 【强制】线程池不允许使用`Executors`去创建，而是通过`ThreadPoolExecutor`的方式，这样的处理方式让写的同学更加明确线程池的运行规则，规避资源耗尽的风险。
> 说明：`Executors`返回的线程池对象的弊端如下：
> 1）`FixedThreadPool`和`SingleThreadPool`:
> 允许的请求队列长度为`Integer.MAX_VALUE`，可能会堆积大量的请求，从而导致`OOM`。
> 2）`CachedThreadPool`和`ScheduledThreadPool`:
> 允许的创建线程数量为`Integer.MAX_VALUE`，可能会创建大量的线程，从而导致`OOM`。
