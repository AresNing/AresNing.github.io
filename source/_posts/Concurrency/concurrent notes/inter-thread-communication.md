---
title: 线程间通信
categories:
  - [Concurrency]
tags:
  - [Concurrency]
  - [synchronized]
  - [Lock]
---


# synchronized

## `wait` + `notify/notifyAll`

```java
class Share {
    private int number = 0;
    public synchronized void incr() {
        while(number != 0) {
            this.wait();
        }
        number++;
        this.notifyAll();
    }
    public synchronized void decr() {
        while(number != 1) {
            this.wait();
        }
        number--;
        this.notifyAll();
    }
}
```

<!--more-->

# Lock

## `wait` + `notify/notifyAll`

```java
class Share {
    private int number = 0;
    private final Lock lock = new ReentrantLock();
    
    public void incr() throws InterruptedException {
        lock.lock();
        try {
            while(number != 0) {
            	this.wait();
        	}
        	number++;
        	this.notifyAll();
        } finally {
            lock.unlock();
        }
    }
    
    public void decr() throws InterruptedException {
        lock.lock();
        try {
            while(number != 1) {
            	this.wait();
        	}
        	number--;
        	this.notifyAll();
        } finally {
            lock.unlock();
        }
    }
}
```

## `Condition` + `await` + `signal/signalAll`

```java
class Share {
    private int number = 0;
    private final Lock lock = new ReentrantLock();
    private Condition condition = lock.newCondition();
    
    public void incr() throws InterruptedException {
        lock.lock();
        try {
            while(number != 0) {
            	condition.await();
        	}
        	number++;
        	condition.signalAll();
        } finally {
            lock.unlock();
        }
    }
    
    public void decr() throws InterruptedException {
        lock.lock();
        try {
            while(number != 1) {
            	condition.await();
        	}
        	number--;
        	condition.signalAll();
        } finally {
            lock.unlock();
        }
    }
}
```

## 多个`Condition`精准唤醒

- 循环打印：打印5次 - 打印10次 - 打印15次

```java
class Share {
    private int flag = 1;
    private final Lock lock = new ReentrantLock();
    private Condition c1 = lock.newCondition();
    private Condition c2 = lock.newCondition();
    private Condition c3 = lock.newCondition();

    public void print5(int loop) throws InterruptedException {
        lock.lock();
        try {
            while(flag != 1) {
                c1.await();
            }
            for (int i = 0; i < 5; i++) {
                System.out.println(Thread.currentThread().getName() + " :: " + i + " : loop: " + loop);
            }
            flag = 2;
            c2.signal();
        } finally {
            lock.unlock();
        }
    }

    public void print10(int loop) throws InterruptedException {
        lock.lock();
        try {
            while(flag != 2) {
                c2.await();
            }
            for (int i = 0; i < 10; i++) {
                System.out.println(Thread.currentThread().getName() + " :: " + i + " : loop: " + loop);
            }
            flag = 3;
            c3.signal();
        } finally {
            lock.unlock();
        }
    }

    public void print15(int loop) throws InterruptedException {
        lock.lock();
        try {
            while(flag != 3) {
                c3.await();
            }
            for (int i = 0; i < 15; i++) {
                System.out.println(Thread.currentThread().getName() + " :: " + i + " : loop: " + loop);
            }
            flag = 1;
            c1.signal();
        } finally {
            lock.unlock();
        }
    }
}
```



# 区别

- `synchronized`
- `Lock`
- `Lock` + `Condition`