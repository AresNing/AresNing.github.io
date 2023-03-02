---
title: Runnable 接口与 Callable 接口
categories:
  - [Concurrency]
tags:
  - [Concurrency]
  - [Runnable]
  - [Callable]
---


# `Runnable`接口与`Callable`接口

<!--more-->

## 是否有返回值

- `Runnable`没有返回值
- `Callable`有返回值

## 是否抛出异常

- `Runnable`不抛出异常
- `Callable`抛出异常

## 实现方法名称不同

- `Runnable`需要实现`run`方法
- `Callable`需要实现`call`方法



# `Future`接口

- 当`call()`方法完成时，结果必须存储在主线程已知的对象中，以便主线程可以知道该线程返回的结果。为此，可以使用`Future `对象
- 将`Future`视为保存结果的对象：它可能暂时不保存结果，但将来会保存（一旦`Callable`返回）
- `Future`基本上是主线程可以跟踪进度以及其他线程的结果的一种方式。要实现此接口，必须重写5种方法，比较麻烦，通常使用`FutureTask`



# 使用：`FutureTask`

- 找一个类，既与`Runnable`有关系，也与`Callable`有关系
- `FutureTask`实现`Runnable`和`Future`，并方便地将两种功能组合在一起。 可以通过为其构造函数提供`Callable`来创建`FutureTask`
  - `FutureTask(Callable<V> callable) `
  - 然后，将`FutureTask`对象提供给`Thread`的构造函数以创建
    `Thread`对象。因此，间接地使用`Callable`创建线程
- 仅在计算完成时才能检索结果；如果计算尚未完成，则阻塞 `get` 方法
- 一旦计算完成，就不能再重新开始或取消计算
- `get `方法而获取结果只有在计算完成时获取，否则会一直阻塞直到任务转入完成状态，然后会返回结果或者抛出异常
- `get `只计算一次，因此 `get `方法放到最后

```java
public static void main(String[] args) throws ExecutionException, InterruptedException {
    FutureTask<Integer> futureTask1 = new FutureTask<>(() -> {
        Thread.sleep(2000);
        return 200;
    });

    FutureTask<Integer> futureTask2 = new FutureTask<>(() -> {
        Thread.sleep(2000);
        return 300;
    });

    new Thread(futureTask1, "aa").start();  // Callable
    new Thread(futureTask2, "bb").start();  // Callable
    // Runnable
    new Thread(() -> {
        System.out.println(400);
    }, "cc").start();

    System.out.println(futureTask1.get());  // 会阻塞在get方法，直到返回结果或抛出异常
    System.out.println(futureTask2.get());

    System.out.println(Thread.currentThread().getName());
}
```

