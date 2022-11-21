---
title: JUC的三大辅助类
categories:
  - [Concurrency]
tags:
  - [Concurrency]
  - [CountDownLatch]
  - [CyclicBarrier]
  - [Semaphore]
---

> CountDownLatch，CyclicBarrier，Semaphore

<!--more-->

# `CountDownLatch` 减小计数

- `CountDownLatch `类可以设置一个计数器，然后通过 `countDown `方法来进行 减 1 的操作，使用 `await` 方法等待计数器不大于 0，然后继续执行 `await `方法 之后的语句
- `CountDownLatch` 主要有两个方法
  - 当一个或多个线程调用 `await `方法时，这些线程会阻塞
  - 其它线程调用 `countDown `方法会将计数器减 1，调用 `countDown `方法的线程不会阻塞
  - 当计数器的值变为 0 时，因 `await` 方法阻塞的线程会被唤醒，继续执行

```java
public static void main(String[] args) throws InterruptedException {
    // 定义计数器，设置初始值
    CountDownLatch countDownLatch = new CountDownLatch(10);

    for (int i = 0; i < 10; i++) {
        new Thread(() -> {
            System.out.println(Thread.currentThread().getName() + " quit");
            countDownLatch.countDown();  //计数器减一,不会阻塞
        }, String.valueOf(i)).start();
    }

    countDownLatch.await();  //主线程 await 休息

    // 全部离开后自动唤醒主线程
    System.out.println(Thread.currentThread().getName() + " finish");
}
```


# `CyclicBarrier` 循环栅栏

- `CyclicBarrier` 的构造方法第一个参数是目标障碍数
  - `CyclicBarrier` 支持一个可选的 `Runnable` 命令，在一组线程中的最后一个线程到达之后（但在释放所有线程之前），该命令只在每个屏障点运行一次
- 每次执行 `CyclicBarrier `一次障碍数会加 1，如果达到了目标障碍数，才会执行`cyclicBarrier.await()`之后的语句
- 可以将 `CyclicBarrier `理解为加 1 操作， `CountDownLatch `理解为减 1 操作

```java
// 设置固定值
private static final int NUMBER = 7;

public static void main(String[] args) {
    // 创建CyclicBarrier，设置目标值[，设置到达目标值之后的动作]
    CyclicBarrier cyclicBarrier = new CyclicBarrier(NUMBER, () -> {
        System.out.println(NUMBER + " threads come to the barrier!!!");
    });

    for (int i = 0; i < 7; i++) {
        new Thread(() -> {
            try {
                System.out.println(Thread.currentThread().getName() + " thread come to the barrier...");
                cyclicBarrier.await();  // 在barrier处等待
            } catch (InterruptedException | BrokenBarrierException e) {
                e.printStackTrace();
            }
        }, String.valueOf(i)).start();
    }
}
```



# `Semaphore` 信号量

- `Semaphore `的构造方法中传入的第一个参数是最大信号量（可以看成最大线程池），每个信号量初始化为一个最多只能分发一个许可证

  - `Semaphore `的构造方法有一个可选参数是设置是否为公平锁

```java
public Semaphore(int permits, boolean fair) {
    sync = fair ? new FairSync(permits) : new NonfairSync(permits);
}
```

- 使用 `acquire` 方 法获得许可证，`release `方法释放许可

- `Semaphore `通常用于限制可以访问某些资源（物理或逻辑的）的线程数目

```java
public static void main(String[] args) {
    // 创建Semaphore，设置最大信号量
    Semaphore semaphore = new Semaphore(3);

    for (int i = 0; i < 5; i++) {
        new Thread(() -> {
            try {
                // 获取许可
                semaphore.acquire();

                System.out.println(Thread.currentThread().getName() + " acquires the resource...");
                // 随机生成占用资源时间
                TimeUnit.SECONDS.sleep(new Random().nextInt(5));

                System.out.println(Thread.currentThread().getName() + " --- releases the resource");

            } catch (InterruptedException e) {
                e.printStackTrace();
            } finally {
                // 释放许可
                semaphore.release();
            }
        }, String.valueOf(i)).start();
    }
}
```

