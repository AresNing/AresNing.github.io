---
title: BigInteger & BigDecimal
categories:
  - [Java Basics]
tags:
  - [Java]
  - [BigInteger]
  - [BigDecimal]
---





> [基础类型BigInteger简介](https://www.cnblogs.com/noteless/p/9877957.html)
>
> [基础类型BigDecimal简介](https://www.cnblogs.com/noteless/p/9896139.html#22)

# BigInteger 和 BigDecimal

- BigInteger 支持任意长度的整数；BigDecimal 支持任意精度的浮点数，可以用它进行精确的计算
- BigInteger 和 BigDecimal 均是**不可变**的

<!--more-->

- 创建
  - `new BigXxx()`
  - `BigXxx.valueOf()`
  - `Scanner对象.nextBigXxx()`
- 方法
  - 加减乘除：`add()`，`substract()`，`multiple()`，`divide()`，`remainder()`，`divideAndRemainder()`，`max()`，`min()`
  - 比较：`compareTo()`
  - 转换：`BigXxx对象.intValue()`，`doubleValue()`
  - 舍入模式：`BigDecimal对象.divide(BigDecimal, RoundingMode)`，如`RoundingMode.HALF_UP`四舍五入



# 使用BigDecimal精度丢失问题

- 问题：使用`new BigDecimal(double val)`，传入参数为`double`类型发生精度丢失
- 原因：`double`不能表示为任何有限长度的二进制小数
- **解决方法**：
  1. 使用`new BigDecimal(String)`构造函数，创建一个参数以**字符串表示数值**的对象
  2. 浮点数使用`valueOf`方法

```java
public class Main {
    public static void main(String[] args) {
        double d = 1.12;
        // 方法一：BigDecimal构造函数使用String来创建
        BigDecimal bigDecimal = new BigDecimal("1.12");
        BigDecimal bigDecimal2 = new BigDecimal(Double.toString(d));  // valueOf源码中的对应操作
        // 方式二：浮点数使用valueOf方法
        BigDecimal bigDecimal3 = BigDecimal.valueOf(d);
        
        System.out.println(bigDecimal);
        System.out.println(bigDecimal2);
        System.out.println(bigDecimal3);
    }
}
```



# 比较 BigDecimal

- 比较 BigDecimal 用`compareTo`方法，例如：`if(bigDecimal1.compareTo(bigDecimal2) == 0) {...}`

```java
public class Main {
    public static void main(String[] args) {
		// 两个BigDecimal的比较
        BigDecimal bigDecimal1 = new BigDecimal("1");
        BigDecimal bigDecimal2 = new BigDecimal("1.0");
        
        // false, 等号比较的是地址，两个对象的地址不同
        if(bigDecimal1 == bigDecimal2) {
            System.out.println("bigDecimal1 == bigDecimal2");
        }
        
        // false, equals方法中有标度比较，两个对象的标度不同
        // if(scale != val.scale()) return false;
        if(bigDecimal1.equals(bigDecimal2)) {
            System.out.println("bigDecimal1.equals(bigDecimal2)");
        }
        
        // true, compareTo去掉了标度比较，只比较值的大小
        if(bigDecimal1.compareTo(bigDecimal2) == 0) {
            System.out.println("bigDecimal1.compareTo(bigDecimal2) == 0");
        }
    }
}
```