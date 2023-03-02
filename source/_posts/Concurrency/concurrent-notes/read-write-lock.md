---
title: 读写锁
categories:
  - [Concurrency]
tags:
  - [Concurrency]
---


# 读写锁

- 读写互斥，读读共享
  - 读锁：共享锁
  - 写锁：独占锁/排它锁

- 无论读锁还是写锁，都会发生死锁（读-写死锁，写-写死锁）

<!--more-->

# `ReentrantReadWriteLock`

- 实现了`ReadWriteLock`接口
- 提供`readLock()`方法，`writeLock()`方法

```java
class MyCache {
    private final Map<String, Object> cache = new HashMap<>();
    
    // 创建读写锁对象
    private final ReadWriteLock readWriteLock = new ReentrantReadWriteLock();

    public void put(String key, Object value) {
        // 写锁
        readWriteLock.writeLock().lock();

        try {
            System.out.println(Thread.currentThread().getName() + " is writing " + key);
            // 模拟写操作耗时
            TimeUnit.MICROSECONDS.sleep(300);
            cache.put(key, value);
            System.out.println(Thread.currentThread().getName() + " finish writing " + key);
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            // 释放写锁
            readWriteLock.writeLock().unlock();
        }
    }

    public Object get(String key) {
        // 读锁
        readWriteLock.readLock().lock();
        Object result = null;
        try {
            System.out.println(Thread.currentThread().getName() + " is getting " + key);
            // 模拟读操作耗时
            TimeUnit.MICROSECONDS.sleep(300);
            result = cache.get(key);
            System.out.println(Thread.currentThread().getName() + " finish getting " + key);
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            // 释放读锁
            readWriteLock.readLock().unlock();
        }

        return result;
    }
}
```



# 深入

1. 无锁
   - 缺点：导致并发问题
2. 添加独占锁：`synchronized`和`ReentrantLock`
   - 缺点：读读不能共享，读性能差
3. 读写锁：`ReentrantReadWriteLock`
   - 优点：读读共享，提升性能；读写/写写互斥，保证并发安全
   - 缺点：
     - **造成锁饥饿**：一直读，写不了（没有写操作）；写锁是独占的，写的时候不能读；读锁是共享的，如果读并发很多的时候，写锁一直进不去，导致锁饥饿
     - 写的时候不能读，只能写完之后才能读（但是持有写锁的线程，可以继续获取读锁）



# 读写锁的降级

- **将写锁降级为读锁**
  - 获取写锁 :arrow_right: 获取 :arrow_right: 读锁释放写锁（此时降级为读锁）:arrow_right:  释放读锁（最终为无锁状态）
- 在线程持有读锁的情况下，该线程不能取得写锁（因为获取写锁的时候，如果发现当前的读锁被占用，就马上获取失败，不管读锁是不是被当前线程持有）
- 在线程持有写锁的情况下，该线程可以继续获取读锁（获取读锁时如果发现写 锁被占用，只有写锁没有被当前线程占用的情况才会获取失败）
- 原因：
  - 当线程获取读锁的时候，可能有其他线程同时也在持有读锁，因此**不能把 获取读锁的线程“升级”为写锁**
  - 而对于获得写锁的线程，它一定独占了读写锁，因此可以继续让它获取读锁，当它同时获取了写锁和读锁后，还可以先释放写锁继续持有读锁，这样一个**写锁就“降级”为了读锁**

> :heavy_exclamation_mark: **读锁不能升级为写锁**