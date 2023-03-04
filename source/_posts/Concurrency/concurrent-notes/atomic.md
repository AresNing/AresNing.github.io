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

![atomic](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/atomic.png)

<!--more-->

# 基本类型原子类

## 包含

- `AtomicInteger`
- `AtomicBoolean`
- `AtomicLong`

## 示例

- 50个线程，每个线程对`MyNumber`执行1000次自增，所有线程完成后输出结果

```java
class MyNumber {
    public AtomicInteger atomicInteger = new AtomicInteger();

    public void addPlusPlus() {
        atomicInteger.getAndIncrement();
    }
}

public class AtomicAPITest {
    public static final int SIZE = 50;

    public static void main(String[] args) throws InterruptedException {
        MyNumber myNumber = new MyNumber();
        CountDownLatch countDownLatch = new CountDownLatch(SIZE);  // 等待50个线程

        for (int i = 0; i < SIZE; i++) {
            new Thread(() -> {
                try {
                    for (int j = 0; j < 1000; j++) {
                        myNumber.addPlusPlus();
                    }
                } finally {
                    countDownLatch.countDown();  // 计数减一
                }
            }, String.valueOf(i)).start();
        }

        countDownLatch.await();  // 阻塞等待

        System.out.println(Thread.currentThread().getName() + "\t" + myNumber.atomicInteger.get());
    }
}
```



# 数组类型原子类

## 包含

- `AtomicIntegerArray`
- `AtomicLongArray`
- `AtomicReferenceArray`



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

- 携带版本号（`version`）的引用类型原子类，可解决 CAS 的`ABA`问题
  - `AtomicStampedReference(V initialRef,  int initialStamp)` 
- 解决修改过多少次的问题
- 状态戳原子引用

## AtomicMarkableReference

- 携带标记位（`flag`）的引用类型原子类
  - `AtomicMarkableReference(V initialRef,  boolean initialMark)` 
- 解决是否修改过的问题，将状态戳简化为`true/false`，一次性的标记
- 状态戳（`true/false`）原子引用



# 对象的属性修改原子类

## 包含

- `AtomicIntegerFieldUpdater`：原子更新对象中`volatile int`类型字段的值
- `AtomicLongFieldUpdater`：原子更新对象中`volatile long`类型字段的值
- `AtomicReferenceFieldUpdater`：原子更新对象中`volatile`引用类型字段的值

## 使用目的

- 以线程安全的方式操作非线程安全对象内的某些字段

## 使用要求

- 更新的对象属性必须使用`public volatile`修饰**（此处也是`volatile`的使用场景）**
- 因为对象的属性修改原子类都是**抽象类**，所以每次使用都必须使用静态方法`newUpdater()`创建一个更新器，并且需要设置想要更新的类和属性

## 示例

- `AtomicIntegerFieldUpdater`为例

```java
/**
 * Created with Intellij IDEA
 * <h3>Concurrent<h3>
 *
 * @author : AresNing
 * @description : 10个线程，每个线程转账1000次，不使用synchronized，使用AtomicIntegerFieldUpdater
 */

class BankAccount {
    String bankName = "CCB";
    public volatile int money = 0;

    AtomicIntegerFieldUpdater<BankAccount> atomicIntegerFieldUpdater =
            AtomicIntegerFieldUpdater.newUpdater(BankAccount.class, "money");

    public void transfer() {
        atomicIntegerFieldUpdater.getAndIncrement(this);
    }
}

public class AtomicIntegerFieldUpdaterTest {
    public static void main(String[] args) throws InterruptedException {
        BankAccount bankAccount = new BankAccount();
        CountDownLatch countDownLatch = new CountDownLatch(10);

        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                try {
                    for (int j = 0; j < 1000; j++) {
                        bankAccount.transfer();
                    }
                } finally {
                    countDownLatch.countDown();
                }
            }, String.valueOf(i)).start();
        }

        countDownLatch.await();

        System.out.println(Thread.currentThread().getName() + "\t" + "result: " + bankAccount.money);
    }
}
```

- `AtomicReferenceFieldUpdater`为例

```java
/**
 * Created with Intellij IDEA
 * <h3>Concurrent<h3>
 *
 * @author : AresNing
 * @description : 多线程并发调用一个类的初始化方法，如果未被初始化过，将执行初始化工作，要求只能被初始化一次，只有一个线程操作成功
 */

class MyVar {
    public volatile Boolean isInit = Boolean.FALSE;

    AtomicReferenceFieldUpdater<MyVar, Boolean> referenceFieldUpdater =
            AtomicReferenceFieldUpdater.newUpdater(MyVar.class, Boolean.class, "isInit");

    public void init() {
        if(referenceFieldUpdater.compareAndSet(this, Boolean.FALSE, Boolean.TRUE)) {
            System.out.println(Thread.currentThread().getName() + "\t" + "----- start init");
            try {
                TimeUnit.SECONDS.sleep(2);
            } catch (Exception e) {
                e.printStackTrace();
            }
            System.out.println(Thread.currentThread().getName() + "\t" + "----- over init");
        } else {
            System.out.println(Thread.currentThread().getName() + "\t" + "----- other thread is working");
        }
    }
}

public class AtomicReferenceFieldUpdaterTest {
    public static void main(String[] args) {
        MyVar myVar = new MyVar();
        for (int i = 0; i < 5; i++) {
            new Thread(myVar::init, String.valueOf(i)).start();
        }
    }
}
```



# 原子操作增强类

## 包含

- `DoubleAccumulator`
- `DoubleAdder`
- `LongAccumulator`
- `LongAdder`

## 区别

- `LongAdder`只能用来计算加减法，且从零开始计算
- `LongAccumulator`则提供了**自定义的函数操作**

## 阿里开发要求

> 如果是 JDK8，**推荐使用`LongAdder`对象**，比`AtomicLong`性能更好（减少乐观锁的重试次数）

![alibaba-java](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/alibaba-java.png)

## 示例

- 热点商品点赞计数器，点赞数加加统计，不要求实时精确
  - 对比四种实现方法的性能：`synchronized`，`AtomicLong`，`LongAdder`，`LongAccumulator`

```java
/**
 * Created with Intellij IDEA
 * <h3>Concurrent<h3>
 *
 * @author : AresNing
 * @date : 2023-03-03 16:55
 * @description : 50个线程，每个线程点赞100w次，计算总点赞数
 */

class ClickNumber {
    
    int number = 0;
    public synchronized void clickBySynchronized() {
        number++;
    }

    AtomicLong atomicLong = new AtomicLong(0);
    public void clickByAtomicLong() {
        atomicLong.getAndIncrement();
    }

    LongAdder longAdder = new LongAdder();
    public void clickByLongAdder() {
        longAdder.increment();
    }

    LongAccumulator longAccumulator = new LongAccumulator((x, y) -> x + y, 0);
    public void clickByLongAccumulator() {
        longAccumulator.accumulate(1);
    }
}

public class AccumulatorCompareDemo {

    public static final int _1W = 10000;
    public static final int threadNumber = 50;

    public static void main(String[] args) throws InterruptedException {

        ClickNumber clickNumber = new ClickNumber();

        long start;
        long end;

        CountDownLatch countDownLatch1 = new CountDownLatch(threadNumber);
        CountDownLatch countDownLatch2 = new CountDownLatch(threadNumber);
        CountDownLatch countDownLatch3 = new CountDownLatch(threadNumber);
        CountDownLatch countDownLatch4 = new CountDownLatch(threadNumber);

        start = System.currentTimeMillis();
        for (int i = 0; i < threadNumber; i++) {
            new Thread(() -> {
                try {
                    for (int j = 0; j < 100 * _1W; j++) {
                        clickNumber.clickBySynchronized();
                    }
                } finally {
                    countDownLatch1.countDown();
                }
            }, String.valueOf(i)).start();
        }
        countDownLatch1.await();
        end = System.currentTimeMillis();
        System.out.println("costTime: " + (end - start) + " ms" + "\t clickBySynchronized: " + clickNumber.number);

        start = System.currentTimeMillis();
        for (int i = 0; i < threadNumber; i++) {
            new Thread(() -> {
                try {
                    for (int j = 0; j < 100 * _1W; j++) {
                        clickNumber.clickByAtomicLong();
                    }
                } finally {
                    countDownLatch2.countDown();
                }
            }, String.valueOf(i)).start();
        }
        countDownLatch2.await();
        end = System.currentTimeMillis();
        System.out.println("costTime: " + (end - start) + " ms" + "\t clickByAtomicLong: " + clickNumber.atomicLong.get());

        start = System.currentTimeMillis();
        for (int i = 0; i < threadNumber; i++) {
            new Thread(() -> {
                try {
                    for (int j = 0; j < 100 * _1W; j++) {
                        clickNumber.clickByLongAdder();
                    }
                } finally {
                    countDownLatch3.countDown();
                }
            }, String.valueOf(i)).start();
        }
        countDownLatch3.await();
        end = System.currentTimeMillis();
        System.out.println("costTime: " + (end - start) + " ms" + "\t clickByLongAdder: " + clickNumber.longAdder.sum());

        start = System.currentTimeMillis();
        for (int i = 0; i < threadNumber; i++) {
            new Thread(() -> {
                try {
                    for (int j = 0; j < 100 * _1W; j++) {
                        clickNumber.clickByLongAccumulator();
                    }
                } finally {
                    countDownLatch4.countDown();
                }
            }, String.valueOf(i)).start();
        }
        countDownLatch4.await();
        end = System.currentTimeMillis();
        System.out.println("costTime: " + (end - start) + " ms" + "\t clickByLongAccumulator: " + clickNumber.longAccumulator.get());
    }
}
```

```shell
costTime: 933 ms	 clickBySynchronized: 50000000
costTime: 586 ms	 clickByAtomicLong: 50000000
costTime: 76 ms	 clickByLongAdder: 50000000
costTime: 69 ms	 clickByLongAccumulator: 50000000
```

## LongAdder 源码分析

![long-adder](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/long-adder.png)

![alibaba-java](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/alibaba-java.png)

![long-adder-diagram](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/long-adder-diagram.png)

### LongAdder性能优于AtomicLong的原因

- `LongAdder`的基本思路是**分散热点**，用空间换时间，将`value`值分散到一个`Cell`数组中，不同线程会命中到数组的不同槽中，各个线程只对自己槽中的那个值进行 CAS 操作，这样热点就被分散了，冲突的概率就小很多；如果要获取真正的`long`值，只要将各个槽中的变量值累加返回
  - 在无竞争的情况下，`LongAdder`和`AtomicLong`一样，对同一个`base`进行操作
  - 多个线程需要同时对`value`进行操作时，可以对线程 id 进行 hash 得到 hash 值，再根据 hash 值映射到`Cell`数组的某个下标，再对该下标对应的值进行自增操作
  - 当所有线程操作完毕，将数组`Cell`的所有值和`base`都加起来作为最终结果
- `sum()`会将所有`Cell`数组中的`value`和`base`累加作为返回值，核心的思想就是将之前`AtomicLong`一个`value`的更新压力分散到多个`value`中去，从而降低更新热点
  - `base`变量：低并发，直接累加到该变量上
  - `Cell[]`数组：高并发，累加进各个线程自己的槽`Cell[i]`中
  - 则最终的和为：$Value=Base+\sum_i^nCell[i]$

### longAdder.increment() 为例

1. `add(1L)`

   - 如果`Cell[]`数组为空，尝试用 CAS 更新`base`字段，成功则退出；

   - 如果`Cell[]`数组为空，CAS 更新`base`字段失败，出现竞争，`uncontended`为`true`，调用`longAccumulate`
   - 如果`Cell[]`非空，但当前线程映射的槽为空，`uncontended`为`true`，调用`longAccumulate`
   - 如果`Cell[]`非空，且当前线程映射的槽非空，CAS 更新`Cell`的值，成功则返回，否则，`uncontended`为`false`，调用`longAccumulate`

2. `longAccumulate()`

   - 首先给当前线程分配一个`hash`值，然后进入一个`for(;;)`自旋，这个自旋分为三个分支：
     - CASE 1：`Cell[]`数组已经初始化了
     - CASE 2：`Cell[]`数组未初始化（首次新建），则尝试对它加锁，并初始化`Cell[]`数组
     - CASE 3：`Cell[]`数组正在初始化中，则尝试直接在基数`base`上进行累加操作

3. `sum()`

   -  会将`Cell[]`数组中的`value`和`base`累加作为返回值
   - 其返回值不是原子性的快照，在并发情况下并非准确值

### LongAdder 与 AtomicLong 的对比

- `AtomicLong`
  - 线程安全，可允许一些性能损耗，要求高精度时可使用
  - **保证精度，牺牲性能作为代价**
  - `AtomicLong`是多个线程针对单个热点值`value`进行原子操作
- `LongAdder`
  - 当需要在高并发下有较好的性能表现，且对值的精确度要求不高时，可以使用
  - **保证性能，牺牲精度作为代价**
  - `LongAdder`是每个线程拥有自己的槽，各个线程一般只对自己槽中的那个值进行 CAS 操作

## 总结

### AtomicLong

- 原理
  - CAS + 自旋
  - 常用方法为`incrementAndGet()`
- 场景
  - 低并发下的全局计算
  - `AtomicLong`能保证并发情况下计数的准确性，其内部通过 CAS 来解决并发安全性的问题
- 缺陷
  - 高并发后性能急剧下降
  - 原因：`AtomicLong`的自旋会成为瓶颈，N个线程 CAS 操作修改值，每次只有一个成功过，其他N-1失败，失败的线程会不断自旋直到成功，这样大量失败自旋，会导致CPU占用率升高

### LongAdder

- 原理
  - CAS + Base + Cell数组分散热点
  - 空间换时间，并分散了热点数据
- 场景
  - 高并发下的全局计算
- 缺陷
  - `sum`求和后还有计算线程修改结果的话，最后jie'guo
