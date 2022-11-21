# `synchronized`实现同步

- `synchronized`实现同步的基础：Java 中的每一个对象都可以作为锁
- 具体表现为以下3种形式：
  - 对于普通同步方法，锁是当前实例对象`this`
  - 对于静态同步方法，锁是当前类的`Class`对象
  - 对于同步方法块，锁是`synchronized`括号里配置的对象



# 公平锁与非公平锁

## 应用

- `synchronized`是非公平锁

- `new ReentrantLock(boolean fair)`，若不传参或`fair == false`则为非公平锁（默认采用非公平锁）；若`fair == true`则为公平锁

  ```java
  public ReentrantLock() {
      sync = new NonfairSync();
  }
  
  public ReentrantLock(boolean fair) {
      sync = fair ? new FairSync() : new NonfairSync();
  }
  ```

## 原理

[【锁】ReentrantLock如何实现公平锁/非公平锁](https://blog.csdn.net/numbbe/article/details/113243325)

## 不同

- 公平锁与非公平锁就是等待队列中的线程排队不排队的问题

## 优劣

### 公平锁

- 优点：大锅饭，统一分配资源
- 缺点：性能下降很多，第一个线程释放锁后，如果还想再次获取锁，需要进入等待队列尾部，重新排队，进入阻塞状态，等待CPU唤醒

### 非公平锁

- 优点：强者恒强，性能高
- 缺点：线程饥饿



# 可重入锁与非重入锁

- `synchronized`和`ReentrantLock`都是可重入锁，也称为**递归锁**
  - `synchronized`称为“隐式”可重入锁，因为`synchronized`自动获取/释放锁
  - `ReentrantLock`称为“显式”可重入锁，因为`Lock`需要手动获取/释放锁

## `synchronized`示例

```java
public static void main(String[] args) {
    Obejct o = new Object();
    new Thread(() -> {
        synchronized(o) {
            ...;
                synchronized(o) {
                	...;
                    synchronized(o) {
                        ...;
                    }
            }
        }
    }, "t1").start();
}
```

## `ReentrantLock`示例

```java
public static void main(String[] args) {
    Lock lock = new ReentrantLock();
    new Thread(() -> {
        try {
            lock.lock();
            ...;
            try {
            	lock.lock();
            	...; 
        	} finally {
            	lock.unlock();
            }
        } finally {
            lock.unlock();
        }
    }, "t1").start();
}
```



# 死锁

## 验证是否是死锁

- `jps`：类似于 Linux 的`ps -ef`
- `jstack`：JVM自带的堆栈跟踪工具
