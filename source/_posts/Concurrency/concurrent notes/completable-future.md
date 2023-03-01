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

- `CompletableFuture`被用于异步编程，可以通过毁掉的方式处理计算结果，也提供了转换和组合`CompletableFuture`的方法
- `CompletableFuture`可能代表了一个明确的`Future`，也有可能代表一个完成阶段（`CompletionStage`），它支持在计算完成后触发一些函数或执行某些动作
- `CompletableFuture`实现了`Future`，`CompletionStage`接口，实现了`Future`接口就可以兼容现有线程池框架，而`CompletionStage`接口才是异步编程的接口抽象，里面定义多种异步方法



## 四个核心的静态方法

### 介绍

- **不建议直接使用`CompletableFuture`的空参构造器创建`CompletableFuture`，而是使用四个核心的静态方法，来创建一个异步任务**

- 四个核心的静态方法
  
  - `runAsync`无返回值
  
  ```java
  public static CompletableFuture<Void> runAsync(Runnable runnable)
  
  public static CompletableFuture<Void> runAsync(Runnable runnable, Executor executor)
  ```
  
  - `supplyAsync`有返回值
  
  ```java
  public static <U> CompletableFuture<U> supplyAsync(Supplier<U> supplier)
  
  public static <U> CompletableFuture<U> supplyAsync(Supplier<U> supplier, Executor executor)
  ```
  
  > 上述`Executor executor`参数说明：
  >
  > - 没有指定`Executor`的方法，直接使用默认的`ForkJoinPool.commonPool()`作为它的线程池执行异步代码，此时相当于是守护线程
  > - 如果指定线程池，则是使用自定义或者特别指定的线程池执行异步代码，此时则是用户线程，记得关闭线程池

### 初步示例

```java
public static void main(String[] args) throws ExecutionException, InterruptedException {
    ExecutorService threadPool = Executors.newFixedThreadPool(3);
	// 无返回值的
    CompletableFuture<Void> completableFuture = CompletableFuture.runAsync(() -> {
        System.out.println(Thread.currentThread().getName());
        try {
            TimeUnit.SECONDS.sleep(1);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }, threadPool);

    System.out.println(completableFuture.get());

    threadPool.shutdown();
}
```

```java
public static void main(String[] args) throws ExecutionException, InterruptedException {
    ExecutorService threadPool = Executors.newFixedThreadPool(3);
    // 有返回值的
    CompletableFuture<String> completableFuture = CompletableFuture.supplyAsync(() -> {
        System.out.println(Thread.currentThread().getName());
        try {
            TimeUnit.SECONDS.sleep(1);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "hello supplyAsync";
    }, threadPool);

    System.out.println(completableFuture.get());

    threadPool.shutdown();
}
```

### 通用示例：减少阻塞和轮询

- `CompletableFuture`是`Future`的功能增强版，减少阻塞和轮询，可以传入回调对象，当异步任务完成或者发生异常时，自动调用回调对象的回调方法
- 主线程设置好回调后，不再关心异步任务的执行，异步任务之间可以顺序执行

```java
public static void main(String[] args) {
    ExecutorService threadPool = Executors.newFixedThreadPool(3);

    try {
        CompletableFuture<Integer> completableFuture = CompletableFuture.supplyAsync(() -> {
            System.out.println(Thread.currentThread().getName() + "--- come in");
            int result = ThreadLocalRandom.current().nextInt(10);
            try {
                TimeUnit.SECONDS.sleep(1);
            } catch (Exception e) {
                e.printStackTrace();
            }
            System.out.println("--------1 second later: " + result);

            if(result > 5) {
                int i = 10 / 0;
            }

            return result;
        }, threadPool).whenComplete((v, e) -> {
            System.out.println("----whenComplete come in");
            if(e == null) {
                System.out.println("mission completed: " + v);
            }
        }).exceptionally(e -> {
            e.printStackTrace();
            System.out.println("异常情况：" + e.getCause() + "\t" + e.getMessage());
            return null;
        });

        System.out.println(Thread.currentThread().getName() + "--- main thread come in");
    } catch (Exception e) {
        e.printStackTrace();
    } finally {
        threadPool.shutdown();
    }
}
```

### 案例：电商网站的比价需求

```java
/**
 * Created with Intellij IDEA
 * @description : 从各网站查询商品价格，统计耗时
 */
public class CompletableFutureMallDemo {

    static List<NetMall> list = Arrays.asList(
            new NetMall("jd"),
            new NetMall("dd"),
            new NetMall("tb"),
            new NetMall("tMall"),
            new NetMall("pdd")
    );

    public static List<String> getPrice(List<NetMall> list, String productName) {
        return list
                .stream().map(netMall ->
                        String.format(productName + " in %s price is %.2f",
                                netMall.getNetMallName(),
                                netMall.calcPrice(productName)))
                .collect(Collectors.toList());
    }

    public static List<String> getPriceByCompletableFuture(List<NetMall> list, String productName) {
        return list.stream().map(netMall -> CompletableFuture.supplyAsync(() ->
                String.format(productName + " in %s price is %.2f",
                        netMall.getNetMallName(),
                        netMall.calcPrice(productName))))
                .collect(Collectors.toList())
                .stream()
                .map(s -> s.join())
                .collect(Collectors.toList());
    }

    public static void main(String[] args) {
        long start = System.currentTimeMillis();

        List<String> list1 = getPrice(list, "mysql");
        list1.forEach(System.out::println);

        long end = System.currentTimeMillis();
        System.out.println("------costTime: " + (end - start) + " ms");

        System.out.println("-----------------");

        long start2 = System.currentTimeMillis();

        List<String> list2 = getPriceByCompletableFuture(list, "mysql");
        list2.forEach(System.out::println);

        long end2= System.currentTimeMillis();
        System.out.println("------costTime: " + (end2 - start2) + " ms");
    }
}


```

```java
class NetMall {
    @Getter
    private String netMallName;

    public NetMall(String netMallName) {
        this.netMallName = netMallName;
    }

    public double calcPrice(String productName) {
        try {
            TimeUnit.SECONDS.sleep(1);  // 模拟查询时间
        } catch (Exception e) {
            e.printStackTrace();
        }
        return ThreadLocalRandom.current().nextDouble() * 2 + productName.charAt(0);
    }
}
```



## 入门

### 使用`CompletableFuture`

- 主线程中创建一个`CompletableFuture`，主线程调用`get`方法会阻塞，最后在一个子线程中使其终止

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



## 常用方法总结

### 获得结果和触发计算

#### 获取结果

| 方法                                 | 说明                                                         |
| ------------------------------------ | ------------------------------------------------------------ |
| `T get()`                            | 阻塞                                                         |
| `T get(long timeout, TimeUnit unit)` | 阻塞，设置超时时间                                           |
| `join()`                             | 阻塞，无需处理异常                                           |
| `getNow(T valueIfAbsent)`            | 立即获取结果不阻塞：计算完成，返回计算结果；计算不完成，返回`valueIfAbsent`值 |

#### 主动触发计算

| 方法                        | 说明                                    |
| --------------------------- | --------------------------------------- |
| `boolean complete(T value)` | 是否打断`get()/join()`方法返回`value`值 |

### 对计算结果进行处理

#### thenApply

- 计算结果存在依赖关系，两个线程串行化
- 异常相关：由于存在依赖关系，当前步骤出异常，则停止，不会继续执行

#### handle

- 计算结果存在依赖关系，两个线程串行化
- 异常相关：有异常也可以往下一步走，根据设置的异常参数可进一步处理

> **比较：**
>
> - `exceptionally`类似于`try/catch`
> - `handle + whenComplete`类似于`try/finally`

### 对计算结果进行消费

#### thenAccept

- 接收任务的处理结果，并消费处理，无返回结果
- 类似于`Consumer`接口

#### 对比补充：任务之间的顺序执行

| 方法                          | 说明                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `thenRun(Runnable runnable)`  | 任务A执行完毕执行任务B，并且B不需要A的结果              |
| `thenAccept(Consumer action)` | 任务A执行完毕执行任务B，B需要A的结果，但是任务B无返回值 |
| `thenApply(Function fn)`      | 任务A执行完毕执行任务B，B需要A的结果，同时任务B有返回值 |

```java
@Test
public void test() {
    System.out.println(CompletableFuture.supplyAsync(() -> "resultA").thenRun(() -> {}).join());
    System.out.println(CompletableFuture.supplyAsync(() -> "resultA").thenAccept(System.out::println).join());
    System.out.println(CompletableFuture.supplyAsync(() -> "resultA").thenApply(r -> r + " resultB").join());
}
```

```shell
# output:
null
resultA
null
resultA resultB
```

### 对计算结果进行选用

#### applyToEither

- `public <U> CompletableFuture<U> applyToEither(CompletionStage<? extends T> other, Function<? super T,U> fn)`
- 两个任务，谁先执行完毕，谁的任务结果作为参数传入`function`

```java
@Test
public void test() {
    CompletableFuture<String> mission_a = CompletableFuture.supplyAsync(() -> {
        System.out.println("Mission A come in");
        try {
            TimeUnit.SECONDS.sleep(3);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "resultA";
    });

    CompletableFuture<String> mission_b = CompletableFuture.supplyAsync(() -> {
        System.out.println("Mission B come in");
        try {
            TimeUnit.SECONDS.sleep(1);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "resultB";
    });

    CompletableFuture<String> result = mission_a.applyToEither(mission_b, f -> f + " is completed first!!!");

    System.out.println(Thread.currentThread().getName() + "\t" + "--------" + result.join());
}
```

```shell
# output:
Mission A come in
Mission B come in
main	--------resultB is completed first!!!
```

### 对计算结果进行合并

#### thenCombine

- `public <U,V> CompletableFuture<V> thenCombine(CompletionStage<? extends U> other, BiFunction<? super T,? super U,? extends V> fn)`
- 两个`CompletionStage`任务都完成后，最终把两个任务的结果一起交给`thenCombine`来处理，先完成的先等待，等待其他分支任务

```java
// 分开写法
@Test
public void test() {
    CompletableFuture<Integer> completableFuture1 = CompletableFuture.supplyAsync(() -> {
        System.out.println(Thread.currentThread().getName() + "\t" + "come in");
        try {
            TimeUnit.SECONDS.sleep(3);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return 10;
    });

    CompletableFuture<Integer> completableFuture2 = CompletableFuture.supplyAsync(() -> {
        System.out.println(Thread.currentThread().getName() + "\t" + "come in");
        try {
            TimeUnit.SECONDS.sleep(1);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return 20;
    });

    CompletableFuture<Integer> result = completableFuture1.thenCombine(completableFuture2, (x, y) -> {
        System.out.println("合并结果");
        return x + y;
    });

    System.out.println(result.join());
}
```

```java
// 合并写法
@Test
public void test() {
    CompletableFuture<Integer> result2 = CompletableFuture.supplyAsync(() -> {
        System.out.println(Thread.currentThread().getName() + "\t" + "come in");
        try {
            TimeUnit.SECONDS.sleep(3);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return 10;
    }).thenCombine(CompletableFuture.supplyAsync(() -> {
        System.out.println(Thread.currentThread().getName() + "\t" + "come in");
        try {
            TimeUnit.SECONDS.sleep(1);
        } catch (Exception e) {
            e.printStackTrace();
        }
        return 20;
    }), (x, y) -> {
        System.out.println("合并结果");
        return x + y;
    });

    System.out.println(result2.join());
}
```

### 针对线程池说明

- 没有传入自定义线程池`Executor`：都用默认线程池`ForkJoinPool`
- 传入自定义线程池：如果在执行第一个任务时，传入一个自定义线程池
  - 调用`thenRun`方法执行第二个任务时，则第二个任务和第一个任务是共用同一个线程池
  - 调用`thenRunAsync`方法执行第二个任务时，则第一个任务使用的是自己传入的线程池，第二个任务使用的是`ForkJoin`线程池，或者是调用`thenRunAsync`方法传入的线程池
- 但会有例外，有可能处理太快，系统优化切换原则，直接用`main`线程处理
- 其他如：`thenAccept`与`thenAcceptAsync`，`thenApply`与`thenApplyAsync`等，其之间的区别同理

## CompletionStage

- 代表异步计算过程中的某一个阶段，一个阶段完成以后**可能会触发**另外一个阶段
- 一个阶段的计算执行可以是一个 `Funtion`，`Consumer` 或者 `Runnable`
  - 比如：`stage.thenApply(x -> square(x)).thenAccept(x -> System.out.print(x)).thenRun(() -> System.out.println())`
- 一个阶段的执行可能是被单个阶段的完成触发，也可能是由多个阶段一起出发

