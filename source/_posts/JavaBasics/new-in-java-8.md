---
title: Java8新特性
categories:
  - [Java Basics]
tags:
  - [Java]
  - [Lambda]
  - [Functional Interface]
  - [Stream]
  - [Optional]
---



<!--more-->

# Lambda表达式

## 本质

- Lambda表达式的实质是**函数式接口的实例**
- 所以以前用匿名内部类表示的，现在都可以用Lambda表达式来写

## 语法

- `->`：箭头操作符
- 左侧：Lambda表达式的形参列表，也就是抽象方法的形参列表
- 右侧：Lambda表达式的方法体，也就是重写的抽象方法的方法体

## 语法总结

- 左侧：
  - Lambda形参列表的参数类型可以省略（类型推断）
  - 如果Lambda形参列表只有一个参数，则小括号`()`可省略
- 右侧：
  - Lambda体应该用大括号`{}`包裹
  - 如果Lambda体只有一条执行语句（包括`return`语句），则大括号`{}`和`return`关键字都可以省略



# 函数式接口

## 定义

- 如果一个接口中，只声明了一个抽象方法，则该接口为函数式接口
- 可以在接口上使用`@FunctionalInterface`注解，以检查它是否是一个函数式接口

## 使用举例

### Java内置四大核心函数式接口

| 函数式接口                 | 参数类型 | 返回类型  | 用途                                                         |
| -------------------------- | -------- | --------- | ------------------------------------------------------------ |
| `Consumer<T>`消费型接口    | `T`      | `void`    | 对类型为`T`的对象应用操作，包含方法：`void accept(T t)`      |
| `Supplier<T>`供给型接口    | /        | `T`       | 返回类型为`T`的对象，包含方法：`T get()`                     |
| `Function<T, R>`函数型接口 | `T`      | `R`       | 对类型为`T`的对象应用操作，并返回类型为`R`的对象，包含方法：`R appply(T t)` |
| `Predicate<T>`断定型接口   | `T`      | `boolean` | 确定类型为`T`的对象是否满足某约束，并返回`boolean`值，包含方法：`boolean test(T t)` |

### 其他接口

| 函数式接口                                                   | 参数类型                        | 返回类型                        | 用途                                                         |
| ------------------------------------------------------------ | ------------------------------- | ------------------------------- | ------------------------------------------------------------ |
| `BiFunction<T, U, R>`                                        | `T, U`                          | `R`                             | 对类型为`T, U`的对象应用操作，返回`R`类型结果，包含方法：`R apply(T t, U u)` |
| `UnaryOperator<T>`（`Function`子接口)                        | `T`                             | `T`                             | 对类型为`T`的对象进行一元运算，并返回类型为`T`的对象，包含方法：`T appply(T t)` |
| `BinaryOperator<T>`（`BiFunction`子接口)                     | `T, T`                          | `T`                             | 对类型为`T`的对象进行二元运算，并返回类型为`T`的对象，包含方法：`T appply(T t1, T t2)` |
| `BiConsumer<T, U>`                                           | `T, U`                          | `void`                          | 对类型为`T, U`的对象应用操作，包含方法：`void accept(T t, U u)` |
| `BiPredicate<T, U>`                                          | `T, U`                          | `boolean`                       | 确定类型为`T, U`的对象是否满足某约束，并返回`boolean`值，包含方法：`boolean test(T t, U u)` |
| `ToIntFunction<T>`<br />`ToLongFunction<T>`<br />`ToDoubleFunction<T>` | `T`                             | `int`<br />`long`<br />`double` | 分别计算`int`、`long`、`double`值的函数                      |
| `IntFunction<T>`<br />`LongFunction<T>`<br />`DoubleFunction<T>` | `int`<br />`long`<br />`double` | `R`                             | 参数分别为`int`、`long`、`double`类型的函数                  |



# 方法引用与构造器引用

## 方法引用 Method References

### 本质

- 方法引用本质上是Lambda表达式，也就是函数式接口的一个实例，通过方法的名字指向一个方法
- 当要传递给Lambda体的操作，已经有实现的方法了，可以使用方法引用

### 格式

- `类/对象::方法名`
- 有三种情况：
  1. `对象::实例方法名`
  2. `类::静态方法名`
  3. `类::实例方法名`

### 要求

- 实现函数式接口的抽象方法的参数列表和返回类型，必须与方法引用的方法的参数列表和返回类型一致（针对情况1和2）

## 构造器引用

### 本质

- 和方法引用类似
- 函数式接口的抽象方法的参数列表和构造器的参数列表一致，抽象方法的返回类型即为构造器所属的类的类型

### 格式

- `类::new`，如`String::new`

## 数组引用

### 本质

- 可以将数组看做是一个特殊的类，则写法与构造器引用一致

### 格式

- `数组名::new`，如`String[]::new`



# Stream API

## 本质

- Stream关注的是对数据的运算，与CPU打交道
- 集合关注的是数据的存储，与内存打交道

## 特性

1. Stream自己不会存储数据
2. Stream不会改变源对象；相反，它们会返回一个持有结果的新Stream
3. Stream操作是延迟执行的，这意味着它们会等到需要结果的时候才执行

## 执行流程

### 1. Stream的实例化，创建Stream

#### 方式一：通过集合

- Java8中的`Collection`接口被扩展，可通过两个默认方法获取流
  1. `default Stream<E> stream()`：返回一个顺序流
  2. `default Stream<E> parallelStream()`：返回一个并行流

```java
@Test
public void test() {
    List<Integer> list = Arrays.asList(1, 2, 3, 4);

    Stream<Integer> stream = list.stream();

    Stream<Integer> parallelStream = list.parallelStream();
}
```



#### 方式二：通过数组

- Java8中的`Arrays`的静态方法`stream()`可以获取流
  1. `static <T> Stream<T> stream(T[] array)`
- 重载形式，能够处理对应基本类型的数组：
  1. `public static IntStream stream(int[] array)`
  2. `public static LongStream stream(long[] array)`
  3. `public static DoubleStream stream(double[] array)`

```java
@Test
public void test2() {
    int[] arr = new int[]{1, 2, 3, 4};
    IntStream intStream = Arrays.stream(arr);

    Integer[] arr2 = new Integer[]{1, 2, 3, 4};
    Stream<Integer> stream = Arrays.stream(arr2);
}
```



#### 方式三：通过Stream的of方法

- 可以调用Stream类静态方法`of()`，通过显示值创建一个流，它可以接收任意数量的参数
  1. `public static <T> Stream<T> of(T... values)`

```java
@Test
public void test3() {
    Stream<Integer> stream = Stream.of(1, 2, 3, 4);

    int[] arr = new int[]{1, 2, 3, 4};
    Stream<int[]> stream1 = Stream.of(arr);
}
```



#### 方式四：创建无限流

- 可以使用静态方法`Stream.iterate()`和`Stream.generate()`创建无限流
  1. 迭代：`public static<T> Stream<T> iterate(final T seed, final UnaryOperator<T> f)`
  2. 生成：`public static<T> Stream<T> generate(Supplier<T> s)`

```java
@Test
public void test4() {
    // 迭代
    // 迭代前10个偶数并打印输出
    Stream.iterate(0, t -> t + 2).limit(10).forEach(System.out::println);
    
    // 生成
    // 生成10个随机数并打印输出
    Stream.generate(Math::random).limit(10).forEach(System.out::println);
}
```



### 2. 一系列中间操作（filter，map，...）

#### 筛选与切片

| 方法                  | 描述                                                         |
| --------------------- | ------------------------------------------------------------ |
| `filter(Predicate p)` | 接收Lambda，从流中排除某些元素                               |
| `distinct()`          | 筛选，通过流所生成元素的`hashCode()`和`equals()`去除重复元素 |
| `limit(long maxSize)` | 截断流，使其元素不超过给定数量                               |
| `skip(long n)`        | 跳过元素，返回一个去掉了前`n`个元素的流。若流中元素不足`n`个，则返回一个空流。与`limit(n)`互补 |

```java
@Test
public void test() {
    List<Integer> list = Arrays.asList(1, 2, 3, 3, 4);

    list.stream().filter(x -> x > 2).forEach(System.out::println);
    list.stream().distinct().forEach(System.out::println);
    list.stream().limit(3).forEach(System.out::println);
    list.stream().skip(3).forEach(System.out::println);
}
```



#### 映射

| 方法                              | 描述                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `map(Function f)`                 | 接收一个函数作为参数，该函数会被应用到每个元素上，并将其映射成一个新的元素 |
| `mapToDouble(ToDoubleFunction f)` | 接收一个函数作为参数，该函数会被应用到每个元素上，产生一个新的`DoubleStream` |
| `mapToInt(ToIntFunction f)`       | 接收一个函数作为参数，该函数会被应用到每个元素上，产生一个新的`IntStream` |
| `mapToLong(ToLongFunction f)`     | 接收一个函数作为参数，该函数会被应用到每个元素上，产生一个新的`LongStream` |
| `flatMap(Function f)`             | 接收一个函数作为参数，将流中的每个值都换成另一个流，然后把所有流连接成一个流 |

```java
// StreamAPITest.java
@Test
public void test2() {
    List<String> list = Arrays.asList("aa", "bb", "cc", "dd");

    list.stream().map(String::toUpperCase).forEach(System.out::println);
    System.out.println();

    list.stream().map(StreamAPITest::fromStringToStream).forEach(s -> s.forEach(System.out::println));
    System.out.println();

    list.stream().flatMap(StreamAPITest::fromStringToStream).forEach(System.out::println);
}

public static Stream<Character> fromStringToStream(String s) {
    List<Character> list = new ArrayList<>();
    for(Character c : s.toCharArray()) {
        list.add(c);
    }
    return list.stream();
}
```

- `map`和`flatMap`，可以类比成`List`的`add`和`addAll`

#### 排序

| 方法                     | 描述                               |
| ------------------------ | ---------------------------------- |
| `sorted()`               | 产生一个新流，其中按自然顺序排序   |
| `sorted(Comparator com)` | 产生一个新流，其中按比较器顺序排序 |

```java
@Test
public void test3() {
    List<Integer> list = Arrays.asList(1, 23, 231, 2, -9);

    list.stream().sorted().forEach(System.out::println);
}
```



### 3. 终止操作

#### 匹配与查找

| 方法                     | 描述                                                         |
| ------------------------ | ------------------------------------------------------------ |
| `allMatch(Predicate p)`  | 检查是否匹配所有元素                                         |
| `anyMatch(Predicate p)`  | 检查是否至少匹配一个元素                                     |
| `noneMatch(Predicate p)` | 检查是否没有匹配所有元素                                     |
| `findFirst()`            | 返回第一个元素                                               |
| `findAny()`              | 返回当前流中的任意元素                                       |
| `count()`                | 返回流中元素总数                                             |
| `max(Comparator com)`    | 返回流中最大值                                               |
| `min(Comparator com)`    | 返回流中最小值                                               |
| `forEach(Consumer c)`    | **内部迭代**（使用`Collection`接口需要用户去做迭代，称为**外部迭代**；相反，Stream API使用内部迭代，即其内部实现了迭代） |

```java
@Test
public void test4() {
    List<Integer> list = Arrays.asList(1, 2, 3, 3, 4);

    boolean allMatch = list.stream().allMatch(x -> x > 1);
    System.out.println(allMatch);  // false

    boolean anyMatch = list.stream().anyMatch(x -> x > 1);
    System.out.println(anyMatch);  // true

    boolean noneMatch = list.stream().noneMatch(x -> x > 1);
    System.out.println(noneMatch);  // false

    Optional<Integer> first = list.stream().findFirst();
    System.out.println(first);  // Optional[1]

    Optional<Integer> any = list.stream().findAny();
    System.out.println(any);  // Optional[1]

    long count = list.stream().count();
    System.out.println(count);  // 5

    Optional<Integer> max = list.stream().max(Integer::compare);
    System.out.println(max);  // Optional[4]

    Optional<Integer> min = list.stream().min(Integer::compare);
    System.out.println(min);  // Optional[1]

    list.stream().forEach(System.out::println);
    list.forEach(System.out::println);
}
```



#### 归约

| 方法                               | 描述                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `reduce(T iden, BinaryOperator b)` | 可以将流中元素反复结合起来，得到一个值，返回`T`           |
| `reduce(BinaryOperator b)`         | 可以将流中元素反复结合起来，得到一个值，返回`Optional<T>` |

```java
@Test
public void test5() {
    List<Integer> list = Arrays.asList(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

    Integer reduce = list.stream().reduce(0, Integer::sum);
    System.out.println(reduce);  // 55

    Integer reduce1 = list.stream().reduce(10, Integer::sum);
    System.out.println(reduce1);  // 65

    Optional<Integer> reduce2 = list.stream().reduce(Integer::sum);
    System.out.println(reduce2);  // Optional[55]
}
```

- `map`和`reduce`的连接通常称为`map-reduce`模式，常用于分布式和大数据应用

#### 收集

| 方法                   | 描述                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `collect(Collector c)` | 将流转换为其他形式。接收一个`Collector`接口的实现，用于给Stream中元素做汇总的方法 |

- `Collector`接口方法中的实现决定了如何对流执行收集的操作，如收集到`List`，`Set`，`Map`等
- **`Collectors`实用类**提供了许多静态方法，可以方便创建常见的收集器实例，具体方法与实例如下表：

| 方法             | 返回类型               | 作用                                      |
| ---------------- | ---------------------- | ----------------------------------------- |
| `toList`         | `List<T>`              | 把流中元素收集到`List`                    |
| `toSet`          | `Set<T>`               | 把流中元素收集到`Set`                     |
| `toCollection`   | `Collection<T>`        | 把流中元素收集到创建的`Collection`        |
| `counting`       | `Long`                 | 计算流中元素的个数                        |
| `summingInt`     | `Integer`              | 对流中元素的整数属性求和                  |
| `averageingInt`  | `Double`               | 计算流中元素`Integer`属性的平均值         |
| `summarizingInt` | `IntSummaryStatistics` | 收集流中`Integer`属性的统计值，如：平均值 |

![collectors-api-1](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/collectors-api-1.png)

![collectors-api-2](https://cdn.jsdelivr.net/gh/AresNing/PrivateImg/img/collectors-api-2.png)

## 说明

1. 一个中间操作链，对数据源的数据进行操作
2. 一旦执行终止操作，才执行中间操作，并产生结果，也称为”惰性求值“。之后，该Stream不会再被使用



# Optional

## 作用

- 解决空指针异常，如果值存在则`isPresnet()`方法会返回`true`，调用`get()`方法会返回该对象
- `Optional<T>`类（`java.util.Optional`）是一个**容器类**，它可以保存类型`T`的值，代表这个值存在；或者仅仅保存`null`，表示这个值不存在
- 原本用`null`表示一个值不存在，现在`Optional`可以更好地表达这一概念，且可以避免空指针异常

## 创建Optional类对象的方法

| 方法                           | 作用                                        |
| ------------------------------ | ------------------------------------------- |
| `Optional.of(T t)`             | 创建一个`Optional`实例，`t`必须非空         |
| `Optional.empty()`             | 创建一个空的`Optional`实例                  |
| **`Optional.ofNullable(T t)`** | **创建一个`Optional`实例，`t`可以为`null`** |

## 判断Optional容器中是否包含对象

| 方法                                           | 作用                                                         |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `boolean isPresent()`                          | 判断是否包含对象                                             |
| `void ifPresent(Consumer<? super T> consumer)` | 如果有值，就执行`Consumer`接口的实现代码，并且该值作为参数传给它 |

## 获取Optional容器的对象

| 方法                                                     | 作用                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `T get()`                                                | 如果有值，返回该值，否则抛异常                             |
| **`T orElse(T other)`**                                  | **如果有值则将其返回，否则返回指定的`other`对象**          |
| `T orElseGet(Supplier<? extends T> other)`               | 如果有值则将其返回，否则返回由`Supplier`接口实现提供的对象 |
| `T orElseThrow(Supplier<? extends X> exceptionSupplier)` | 如果有值则将其返回，否则抛出由`Supplier`接口实现提供的异常 |
