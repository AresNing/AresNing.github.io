---
title: ThreadLocal
categories:
  - [Concurrency]
tags:
  - [Concurrency]
  - [ThreadLocal]
---



# ThreadLocal 简介

## 概念

- 该类提供线程局部变量。 这些变量与它们的正常对应物的不同之处在于，访问其中的每个线程（通过其`get`或`set`方法）具有其自己的、独立初始化的变量副本
-  `ThreadLocal`实例通常是希望**将状态与线程相关联的类中的私有静态字段（例如，用户ID或事务ID）**
- 只要线程处于活动状态且`ThreadLocal`实例可访问，每个线程都拥有对其线程局部变量副本的隐式引用; 在一个线程消失之后，它的所有线程局部实例副本都要进行垃圾收集（除非存在对这些副本的其他引用）

<!--more-->

## 注意事项

- `ThreadLocal`的初始化使用`withInitial`方法

  ```java
  ThreadLocal<Integer> threadLocalField = ThreadLocal.withInitial(() -> 0);
  ```

- 阿里巴巴编程规范：

  - 必须回收自定义的`ThreadLocal`变量，尤其在线程池场景下，线程经常会被复用，**如果不清理自定义的` ThreadLocal`变量，可能会影响后续业务逻辑和造成内存泄露**等问题

  - 尽量在代理中使用`try-finally`块进行回收。 正例： 

    ```java
    objectThreadLocal.set(userInfo); 
    try { 
        // ... 
    } finally { 
        objectThreadLocal.remove(); 
    }
    ```



# 源码分析

## Thread、ThreadLocal、ThreadLocalMap 关系

![thread-threadlocal-threadlocalmap](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/thread-threadlocal-threadlocalmap.png)

![thread-threadlocal-threadlocalmap-2](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/thread-threadlocal-threadlocalmap-2.png)

![thread-local-map](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/thread-local-map.png)

![thread-threadlocal-threadlocalmap-3](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/thread-threadlocal-threadlocalmap-3.png)

![thread-threadlocal-threadlocalmap-4](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/thread-threadlocal-threadlocalmap-4.png)



# 内存泄露问题

## 为什么要用”弱引用“

![threadlocal-weak-reference](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/threadlocal-weak-reference.png)

![threadlocal-weak-reference-2](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/threadlocal-weak-reference-2.png)

![threadlocal-weak-reference-3](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/threadlocal-weak-reference-3.png)

![threadlocal-weak-reference-4](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/threadlocal-weak-reference-4.png)

## 最佳实践

1. `ThreadLocal.withInitial(() -> 初始化值);`，避免空指针异常

2. 建议把`ThreadLocal`修饰为`static`

   - 阿里巴巴编程规范

     ![threadlocal-static](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/threadlocal-static.png)

3. 用完`ThreadLocal`记得手动`remove`，清除`key`为`null`的脏`Entry`

  

# 总结

![threadlocal-summary](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/threadlocal-summary.png)