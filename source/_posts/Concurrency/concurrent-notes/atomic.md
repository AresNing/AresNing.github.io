---
title: atomic
categories:
  - [Concurrency]
tags:
  - [Concurrency]
  - [atomic]
  - [CAS]
---



# 原子类

<!--more-->



# 引用类型原子类

## AtomicReference

- 示例：手写自旋锁

```java
public class SpinLockDemo {
    private AtomicReference<Thread> atomicReference = new AtomicReference<>();

    public void lock() {
        Thread thread = Thread.currentThread();
        System.out.println(thread.getName() + " come in");
        while (!atomicReference.compareAndSet(null, thread)) {  // 自旋操作
            System.out.println(thread.getName() + " spin lock-----");
        }
    }

    public void unlock() {
        Thread thread = Thread.currentThread();
        atomicReference.compareAndSet(thread, null);
        System.out.println(thread.getName() + " finished");
    }

    public static void main(String[] args) {
        SpinLockDemo spinLock = new SpinLockDemo();
        new Thread(() -> {
            spinLock.lock();
            try {
                TimeUnit.SECONDS.sleep(3);
            } catch (Exception e) {
                e.printStackTrace();
            }
            spinLock.unlock();
        }, "A").start();

        try {
            TimeUnit.MICROSECONDS.sleep(10);  // 确保线程A先于线程B启动
        } catch (Exception e) {
            e.printStackTrace();
        }

        new Thread(() -> {
            spinLock.lock();
            spinLock.unlock();
        }, "B").start();
    }
}
```

## AtomicStampedReference

- 可解决 CAS 的`ABA`问题，时间戳记

```java
```

