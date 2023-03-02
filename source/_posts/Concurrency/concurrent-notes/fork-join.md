---
title: Fork/Join 框架
categories:
  - [Concurrency]
tags:
  - [Concurrency]
---



# Fork/Join 框架

- Fork：把一个复杂任务进行分拆
- Join：把分拆任务的结果进行合并

![fork-join-framework](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/fork-join-framework.png)



<!--more-->

## ForkJoinTask

- `ForkJoinTask`提供了任务中执行`fork()`和`join()`的机制
- 通常情况下不需要直接生成`ForkJoinTask`类，只需要继承它的子类
  - `RecursiveTask`：用于有返回结果的任务
  - `RecursiveAction`：用于没有返回结果的任务

![recursive-task](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/recursive-task.png)

## ForkJoinPool

- `ForkJoinTask`需要通过`ForkJoinPool`执行
- 类比线程池

## 实现原理

- `ForkJoinPool`由`ForkJoinTask`数组和`ForkJoinWorkerThread`数组组成，`ForkJoinTask`数组负责将存放以及将程序提交给`ForkJoinPool`，而 `ForkJoinWorkerThread `负责执行这些任务



# Fork 方法

- 当调用 `ForkJoinTask` 的 `fork` 方法时，程序会把任务放在 `ForkJoinWorkerThread` 的 `workQueue` 的`push`中，异步执行这个任务，然后立即返回结果

```java
public final ForkJoinTask<V> fork() {
    Thread t;
    if ((t = Thread.currentThread()) instanceof ForkJoinWorkerThread)
        ((ForkJoinWorkerThread)t).workQueue.push(this);
    else
        ForkJoinPool.common.externalPush(this);
    return this;
}
```

- `push` 方法把当前任务存放在 `ForkJoinTask` 数组队列里；然后再调用 `ForkJoinPool` 的 `signalWork()`方法唤醒或创建一个工作线程来执行任务

```java
final void push(ForkJoinTask<?> task) {
    ForkJoinTask<?>[] a; ForkJoinPool p;
    int b = base, s = top, n;
    if ((a = array) != null) {    // ignore if queue removed
        int m = a.length - 1;     // fenced write for task visibility
        U.putOrderedObject(a, ((m & s) << ASHIFT) + ABASE, task);
        U.putOrderedInt(this, QTOP, s + 1);
        if ((n = s - b) <= 1) {
            if ((p = pool) != null)
                p.signalWork(p.workQueues, this);
        }
        else if (n >= m)
            growArray();
    }
}
```



# Join 方法

- `Join` 方法的主要作用是阻塞当前线程并等待获取结果
- 首先调用 `doJoin `方法，通过 `doJoin()` 方法得到当前任务的状态来判断返回什么结果
- 任务状态有 4 种
  1. 已完成（`NORMAL`）
  2. 被取消（`CANCELLED`）
  3. 信号（`SIGNAL`）
  4. 出现异常（`EXCEPTIONAL`）
- 如果任务状态是已完成，则直接返回任务结果
- 如果任务状态是被取消，则直接抛出 `CancellationException`
- 如果任务状态是抛出异常，则直接抛出对应的异常

```java
public final V join() {
    int s;
    if ((s = doJoin() & DONE_MASK) != NORMAL)
        reportException(s);
    return getRawResult();
}
```

- 在 doJoin()方法流程如下：
  1. 首先通过查看任务的状态，看任务是否已经执行完成，如果执行完成，则直接返回任务状态
  2. 如果没有执行完，则从任务数组里取出任务并执行
  3. 如果任务顺利执行完成，则设置任务状态为 `NORMAL`；如果出现异常，则记录异常，并将任务状态设置为 `EXCEPTIONAL`

```java
private int doJoin() {
    int s; Thread t; ForkJoinWorkerThread wt; ForkJoinPool.WorkQueue w;
    return (s = status) < 0 ? s :
    ((t = Thread.currentThread()) instanceof ForkJoinWorkerThread) ?
        (w = (wt = (ForkJoinWorkerThread)t).workQueue).
        tryUnpush(this) && (s = doExec()) < 0 ? s :
    wt.pool.awaitJoin(w, this, 0L) :
    externalAwaitDone();
}

final int doExec() {
    int s; boolean completed;
    if ((s = status) >= 0) {
        try {
            completed = exec();
        } catch (Throwable rex) {
            return setExceptionalCompletion(rex);
        }
        if (completed)
            s = setCompletion(NORMAL);
    }
    return s;
}
```



#异常处理 

- `ForkJoinTask` 在执行的时候可能会抛出异常，但没办法在主线程里直接捕获异常，所以 `ForkJoinTask` 提供了 `isCompletedAbnormally()` 方法来检查任务是否已经抛出异常或已经被取消了，并且可以通过 `ForkJoinTask` 的 `getException` 方法获取异常
- `getException` 方法返回 `Throwable` 对象，如果任务被取消了则返回 `CancellationException`；如果任务没有完成或者没有抛出异常则返回 `null`



# 用例

```java
/**
 * 此种方法似乎不常用
 */
class AddTask extends RecursiveTask {
    private static final Integer VALUE = 10;
    private int begin;
    private int end;
    private int result;

    public AddTask(int begin, int end) {
        this.begin = begin;
        this.end = end;
    }

    @Override
    protected Integer compute() {
        if(end - begin <= VALUE) {
            for (int i = begin; i <= end; i++) {
                result += i;
            }
        } else {
            // 任务切分
            int mid = begin + (end - begin) / 2;
            // 递归调用
            AddTask addTask1 = new AddTask(begin, mid);
            AddTask addTask2 = new AddTask(mid + 1, end);

            // 异步执行
            addTask1.fork();
            addTask2.fork();

            // 同步阻塞获取结果
            result = (int) addTask1.join() + (int) addTask2.join();
        }

        // 返回结果
        return result;
    }
}
```

```java
public class ForkJoinDemo {
    public static void main(String[] args) {
        // 创建任务
        AddTask addTask = new AddTask(1, 100);
        // 创建执行对象
        ForkJoinPool forkJoinPool = new ForkJoinPool();
        // 提交任务执行
        ForkJoinTask<Integer> result = forkJoinPool.submit(addTask);

        try {
            // 输出结果
            System.out.println(result.get());
        } catch (InterruptedException | ExecutionException e) {
            e.printStackTrace();
        } finally {
            // 关闭 forkJoinPool
            forkJoinPool.shutdown();
        }
    }
}
```

