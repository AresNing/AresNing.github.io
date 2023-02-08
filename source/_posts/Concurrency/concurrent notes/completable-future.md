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

> `Future`在 Java 里通常用来表示一个异步任务的引用，比如将任务提交到线程池里面，会得到一个`Future`，在`Future`里面有`isDone`方法来判断任务是否结束，`get`方法来一直阻塞知道任务结束然后获取结果

<!--more-->

1. 不支持手动完成
   - 假设提交了一个任务，但该任务执行太慢，此时已通过其他路径获取了任务结果，但无法把任务结果通知正在执行的线程，因此必须主动取消或一直等待它执行
2. 不支持进一步的非阻塞调用
   - `Future`的`get`方法会一直阻塞到任务完成，但如果想在获取任务之后执行额外的任务，因为`Future`不支持回调函数，因此无法实现该功能
3. 不支持链式调用
   - 对于`Future`的执行结果，如果想继续传到下一个`Future`处理使用，从而形成一个链式的`pipeline`调用，这在`Future`中无法实现
4. 不支持多个`Future`合并
   - 假设有多个`Future`并行执行，想在所有`Future`运行完毕之后，执行某些函数，这是无法通过`Future`实现的
5. 不支持异常处理
   - `Future`没有任何异常处理的API，因此在异步运行时，不好进行故障定位

# CompletableFuture

![completable-future](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/completable-future.png)

## 简介

- `CompletableFuture`被用于异步编程
- `CompletableFuture`实现了`Future`，`CompletionStage`接口，实现了`Future`接口就可以兼容现有线程池框架，而`CompletionStage`接口才是异步编程的接口抽象，里面定义多种异步方法

## 入门

### 使用`CompletableFuture`

- 主线程中创建一个`CompletableFuture`，主线程低矮用调用`get`方法会阻塞，最后在一个子线程中使其终止

```java
public static void main(String[] args) throws Exception {
    CompletableFuture<String> future = new Completable<>();
    
    new Thread(() -> {
        try {
            System.out.println(Thread.currentThread().getName() + "子线程开始启动");
            // 子线程睡眠5s
            TimeUnit.SECONDS.sleep(5);
            // 子线程中完成主线程
            future.complete("success");
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
    }, "A").start();
	// 主线程调用get方法阻塞
    System.out.println("主线程获取结果" + future.get());
    System.out.println("主线程完成，阻塞结束");
}
```

### 没有返回值的异步任务

```java
public static void main(String[] args) throws Exception {
    System.out.println("主线程开始");
    // 运行一个没有返回值的异步任务
    CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
        try {
            System.out.println("子线程开始");
            TimeUnit.SECONDS.sleep(5);
            System.out.println("子线程结束");
        } catch (Exception e) {
            e.printStackTrace();
        }
    });
	//主线程阻塞
    future.get();
    System.out.println("主线程结束");
}
```

### 有返回值的异步任务

```java
public static void main(String[] args) throws Exception {
    CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
        try {
            System.out.println("子线程开始");
            TimeUnit.SECONDS.sleep(5);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "子线程结束";
    });
    //主线程阻塞
    String s = future.get();
    System.out.println("主线程结束, 子线程的结果为:" + s);
}
```

### 线程依赖

- 当一个线程依赖另一个线程时，可以使用`thenApply`方法来把两个线程串行化

```java
// 先对一个数先加10，然后取平方
private static Integer num = 10;
public static void main(String[] args) throws Exception {
    System.out.println("主线程开始");
    CompletableFuture<Integer> future = CompletableFuture.supplyAsync(() -> {
        try {
            System.out.println("加10任务开始");
            num += 10;
        } catch (Exception e) {
            e.printStackTrace();
        }
        return num;
    }).thenApply(Integer -> num * num);

    Integer integer = future.get();
    System.out.println("主线程结束, 子线程的结果为:" + integer);
}
```

### 消费任务结果

- `thenAccpet`消费任务处理的结果，无返回结果

```java
// 先对一个数先加10，然后取平方
private static Integer num = 10;
public static void main(String[] args) throws Exception {
    System.out.println("主线程开始");
    CompletableFuture.supplyAsync(() -> {
        try {
            System.out.println("加10任务开始");
            num += 10;
        } catch (Exception e) {
            e.printStackTrace();
        }
        return num;
    }).thenApply(Integer -> num * num)
        .thenAccept(integer -> System.out.println("子线程全部处理完成,最后调用了 accept,结果为:" + integer));
}
```

### 异常处理

- `exceptionally`异常处理，出现异常时触发

```java
private static Integer num = 10;
public static void main(String[] args) throws Exception {
    System.out.println("主线程开始");
    CompletableFuture<Integer> future = CompletableFuture.supplyAsync(() -> {
        int i = 1/0;
        System.out.println("加10任务开始");
        num += 10;
        return num;
    }).exceptionally(throwable -> {
        System.out.println(throwable.getMessage());
        return -1;
    });

    System.out.println(future.get());
}
```

- `handle`类似于`thenApply`/`thenRun`方法，是最后一步的处理调用，但是同时可以处理异常

```java
private static Integer num = 10;
public static void main(String[] args) throws Exception {
    System.out.println("主线程开始");
    CompletableFuture<Integer> future = CompletableFuture.supplyAsync(() -> {
        System.out.println("加10任务开始");
        num += 10;
        return num;
    }).handle((i, ex) -> {
        System.out.println("进入handle方法");
        if(ex != null) {
            System.out.println("发生异常：" + ex.getMessage());
            return -1;
        } else {
            System.out.println("正常完成，内容为" + i);
            return i;
        }
    });

    System.out.println(future.get());
}
```

### 结果合并

- `thenCompose`合并两个**有依赖关系**的`CompletableFuture`的执行结果

```java
private static Integer num = 10;
public static void main(String[] args) throws Exception {
    System.out.println("主线程开始");
    // 第一步加 10
    CompletableFuture<Integer> future = CompletableFuture.supplyAsync(() -> {
        System.out.println("加10任务开始");
        num += 10;
        return num;
    });
	// 合并
    CompletableFuture<Integer> future1 = future.thenCompose(integer -> 
        // 再创建一个CompletableFuture
    	CompletableFuture.supplyAsync(() -> integer + 1));

    System.out.println(future.get());
    System.out.println(future1.get());
}
```

- `thenCompose`合并两个**没有依赖关系**的`CompletableFuture`的执行结果

```java
private static Integer num = 10;
public static void main(String[] args) throws Exception {
    System.out.println("主线程开始");
    CompletableFuture<Integer> job1 = CompletableFuture.supplyAsync(() -> {
        System.out.println("加10任务开始");
        num += 10;
        return num;
    });

    CompletableFuture<Integer> job2 = CompletableFuture.supplyAsync(() -> {
        System.out.println("乘10任务开始");
        num *= 10;
        return num;
    });
	// 合并两个结果
    CompletableFuture<Object> future = job1.thenCombine(job2, (BiFunction<Integer, Integer, List<Integer>>) (integer, integer2) -> {
        List<Integer> list = new ArrayList<>();
        list.add(integer);
        list.add(integer2);
        return list;
    });

    System.out.println("合并结果：" + future.get());
}
```

- 合并**多个**任务的结果：`allOf`与`anyOf`

1. `allOf`：一系列独立的`future`任务，所有任务执行完成后再进行下一步，或者使用`stream`和`Completable.join`方法将任务结果进行合并

```java
private static Integer num = 10;
public static void main(String[] args) throws Exception {
    System.out.println("主线程开始");
    List<CompletableFuture> list = new ArrayList<>();

    CompletableFuture<Integer> job1 = CompletableFuture.supplyAsync(() -> {
        System.out.println("加10任务开始");
        num += 10;
        return num;
    });
    list.add(job1);

    CompletableFuture<Integer> job2 = CompletableFuture.supplyAsync(() -> {
        System.out.println("乘10任务开始");
        num *= 10;
        return num;
    });
    list.add(job2);

    CompletableFuture<Integer> job3 = CompletableFuture.supplyAsync(() -> {
        System.out.println("减10任务开始");
        num -= 10;
        return num;
    });
    list.add(job3);

    CompletableFuture<Integer> job4 = CompletableFuture.supplyAsync(() -> {
        System.out.println("除10任务开始");
        num /= 10;
        return num;
    });
    list.add(job4);
	// 多任务合并
    List<Integer> collect = list.stream().map(CompletableFuture<Integer>::join).collect(Collectors.toList());
    System.out.println(collect);
}
```

2. `anyOf`：只要在多个`future`里面有一个返回，整个任务结束，而不需要等到每一个`future`结束

```java
private static Integer num = 10;
public static void main(String[] args) throws Exception {
    System.out.println("主线程开始");
    CompletableFuture<Integer>[] futures = new CompletableFuture[4];

    CompletableFuture<Integer> job1 = CompletableFuture.supplyAsync(() -> {
        try {
            TimeUnit.SECONDS.sleep(5);
            System.out.println("加10任务开始");
            num += 10;
            return num;
        } catch (Exception e) {
            return 0;
        }

    });
    futures[0] = job1;

    CompletableFuture<Integer> job2 = CompletableFuture.supplyAsync(() -> {
        try {
            TimeUnit.SECONDS.sleep(2);
            System.out.println("乘10任务开始");
            num *= 10;
            return num;
        } catch (Exception e) {
            return 1;
        }
    });
    futures[1] = job2;

    CompletableFuture<Integer> job3 = CompletableFuture.supplyAsync(() -> {
        try {
            TimeUnit.SECONDS.sleep(3);
            System.out.println("减10任务开始");
            num -= 10;
            return num;
        } catch (Exception e) {
            return 2;
        }
    });
    futures[2] = job3;

    CompletableFuture<Integer> job4 = CompletableFuture.supplyAsync(() -> {
        try {
            TimeUnit.SECONDS.sleep(4);
            System.out.println("除10任务开始");
            num /= 10;
            return num;
        } catch (Exception e) {
            return 3;
        }
    });
    futures[3] = job4;

    CompletableFuture<Object> future = CompletableFuture.anyOf(futures);
    System.out.println(future.get());
}
```

## CompletionStage

- 代表异步计算过程中的某一个阶段，一个阶段完成以后**可能会触发**另外一个阶段
- 一个阶段的计算执行可以是一个 `Funtion`，`Consumer` 或者 `Runnable`
  - 比如：`stage.thenApply(x -> square(x)).thenAccept(x -> System.out.print(x)).thenRun(() -> System.out.println())`
- 一个阶段的执行可能是被单个阶段的完成触发，也可能是由多个阶段一起出发