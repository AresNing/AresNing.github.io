---
title: 多态
categories:
  - [Java Basics]
tags:
  - [Java]
  - [多态]
---

> 下文来自 *On Java 8 - Chapter 9*

# 前言

- 多态，也称为动态绑定、后期绑定、运行时绑定
- Java 中除了`static`和`final`方法（`private`方法也是隐式的`final`）外，其他所有方法都是后期绑定
  - 指明`final`可以防止方法被重写，有效地”关闭了“动态绑定
  - 然而，大部分情况下这样做不会对程序的整体性能带来什么改变，因此最好是为了设计使用`final`，而不是为了提升性能而使用

<!--more-->

# 陷阱：重写私有方法

- 需要小心重写`private`方法的现象，编译器不报错，但可能不会按预期的执行

```java
public class PrivateOverride {
    private void f() {
        System.out.println("private f()");
    }
    
    public static void main(String[] args) {
        PrivateOverride po = new Derived();
        po.f();
    }
}

class Derived extends PrivateOverride {
    public void f() {
        System.out.println("public f()");
    }
}
```

```bash
output: private f()
# 你可能期望输出public f()，然而private方法可以当作是final的
# 因为基类版本的f()屏蔽了Derived，因此它都不算是重写方法
```

- 为了清晰起见，
  - 派生类中的方法名采用与基类中`private`方法名不同的命令
  - 使用`@Override`注解，以便检测问题

# 陷阱：属性与静态方法

- **只有普通的方法调用可以是多态的**

## 属性

- 当子类对象向上转型为父类引用时，任何属性访问都被编译器解析，因此不是多态的，此时访问同名属性，得到的是父类的属性
- 当子类引用时，默认的属性不是父类版本的属性，为了获取父类属性，需要显式地指明`super.field`
- 为了避免以上令人困惑的问题，
  - 通常会将所有属性都指明为`private`，因此不能直接访问它们，只能通过方法访问
  - 尽量不要给基类属性和派生类属性起相同的名字

## 静态方法

- 如果一个方法是静态（`static`）的，其行为不具有多态性
- 静态方法只与类相关，与单个的对象无关

# 构造器和多态

## 构造器调用顺序

1. 在所有事发生前，分配给对象的存储空间会被初始化为二进制0
2. 基类构造器被调用。该步骤被递归重复，类层次的顶级父类会被最先构造，然后是它的派生类，以此类推，直到最底层的派生类
   - 如果在基类构造器中调用普通方法，会调用子类重写后的方法
3. 按声明顺序初始化成员
4. 调用派生类构造器的方法体

## 编写构造器的一条良好规范

- 尽量不要调用类中的任何方法
- 在基类的构造器中能安全调用的只有基类的`final`方法（也适用于可被看作是`final`的`private`方法），因为这些方法不能被重写，因此不会产生意想不到的结果

## 继承和清理

- 由于继承，如果需要特殊的清理工作，必须在派生类中重写`dispose()`方法，记得调用基类的`dispose()`方法，否则基类的清理工作不会发生
- 销毁的顺序应该与初始化的顺序相反，以防一个对象依赖另一个对象
  - 对于属性而言，意味着与声明的顺序相反
  - 对于基类，首先进行派生类的清理工作，然后是基类的清理（因为派生类的清理可能会调用基类的一些方法，所以基类组件不能过早地被销毁）
- 一旦某个成员对象被其他一个或多个对象共享时，不能只是简单地调用`dispose()`，也许必须使用**引用计数**来跟踪仍然访问着共享对象的对象数量

```java
class Shared {
    private int refcount = 0;
    private static long counter = 0;  // long型防止溢出
    private final long id = counter++;  // id是final，id值在初始化确定后不应该变化
    
    Shared() {
        System.out.println("Creating " + this);
    }
    
    public viud addRef() {
        refcount++;
    }
    
    protected void dispose() {
        if(--refcount == 0) {
            System.out.println("Disposing " + this);
        }
    }
}
```

# 协变返回类型

- 协变返回类型，表示派生类的被重写方法可以返回基类方法返回类型的派生类型

```java
class Grain {}

class Wheat extends Grain {}

class Mill {
    Grain process() {
        return new Grain();
    }
}

class WheatMill extends Mill {
    @Override
    Wheat process() {  // 协变返回类型，Grain -> Wheat
        return new Wheat();
    }
}
```