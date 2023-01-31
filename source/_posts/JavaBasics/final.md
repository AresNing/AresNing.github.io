---
title: final关键字
categories:
  - [Java Basics]
tags:
  - [Java]
  - [final]
---

> 下文来自 *On Java 8 - Chapter 8 Reuse*

# 前言

- `final`表示”这是不能改变的“
- 可能使用`final`的三个地方：数据、方法、类

<!--more-->

# `final`数据

- 对于基本类型，`final`使数据恒定不变
- 对于对象引用，`final`使引用恒定不变：一旦引用被初始化执行了某个对象，它就不能改为指向其他对象；但是，对象本身是可以修改的

# 空白`final`

- 空白`final`：没有初始化值的`final`属性
- 编译器确保空白`final`在使用前必须被初始化，既能使一个类的每个对象的`final`属性值不同，也能保持它的不变性

```java
class Poppet {
    private int i;
    
    Poppet(int i) {
        this.i = i;
    }
}

public class BlankFinal {
    private final int i = 0;
    private final int j;  // Blank final
    private final Poppet p;  // Blank final reference
    // Blank finals MUST be initialized in constructor
    public BlankFinal() {
        j = 1;
        p = new Poppet(1);
    }
    
    public BlankFinal(int x) {
        j = x;
        p = new Poppet(x);
    }
}
```

# `final`参数

- 在参数列表中，将参数声明为`final`意味着在方法中不能改变参数指向的对象或基本变量
- `final`基本类型参数，只能读取而不能修改参数，主要用于传递数据给匿名内部类

# `final`方法

- 使用`final`方法的原因
  1. 给方法上锁，防止子类通过覆写改变方法的行为。这是出于继承的考虑，确保方法的行为不会因继承而改变
  2. （现在已经不推荐）效率考虑，
- 应该让编译器和 JVM 处理性能问题，只有在为了明确禁止覆写方法时才使用`final`

# `final`类

- `final`修饰一个类，说明它不能被继承
- `final`类的属性可以根据个人选择是或不是`final`
- 由于`final`禁止继承，类中所有方法都被隐式指定为`final`，所以无法覆写它们
- 原因：是因为类的设计永远不需要改动，或者是处于安全考虑不希望它有子类