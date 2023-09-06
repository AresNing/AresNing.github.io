---
title: 策略模式
categories:
  - [Design Pattern]
tags:
  - [Design Pattern]
  - [Strategy Pattern]
---

# 概念

- 策略模式（Strategy Pattern）中一个类的行为或其算法可以在运行时更改，属于**行为型模式**
- 在策略模式定义了一系列算法或策略，并将每个算法封装在独立的类中，使得它们可以**互相替换**
- 通过使用策略模式，可以在**运行时根据需要选择不同的算法，而不需要修改客户端代码**

<!--more-->

# 介绍

## 主要解决

- 在有多种算法相似的情况下，使用 if...else 所带来的复杂和难以维护

## 关键代码

- 实现同一个接口

## 优点

1. 算法可以自由切换
2. 避免使用多重条件判断
3. 扩展性良好。

## 缺点

1. 策略类会增多
2. 所有策略类都需要对外暴露

## 使用场景 

1. 如果在一个系统里面有许多类，它们之间的区别仅在于它们的行为，那么使用策略模式可以动态地让一个对象在许多行为中选择一种行为
2. 一个系统需要动态地在几种算法中选择一种
3. 如果一个对象有很多的行为，使用策略模式可避免使用多重的条件选择语句

## 注意事项

- 不推荐经典策略模式，更推荐**简单策略用枚举策略模式**，**复杂策略用工厂策略模式**

# 实现

> **引入例子**
>
> - 需求：对一份股票数据列表，给出低价榜、高价榜、涨幅榜；其中只有排序条件的区别，比较适合作为策略模式的例子

## 经典策略模式

### 基本思路

- 创建表示各种策略的对象、一个行为随着策略对象改变而改变的 context 对象
- 策略对象改变 context 对象
- 策略模式通过将算法与使用算法的代码解耦，提供了一种动态选择不同算法的方法；客户端代码不需要知道具体的算法细节，而是通过调用上下文类来使用所选择的策略

### 核心角色

- 上下文（Context）：维护一个对策略对象的引用，负责将客户端请求委派给具体的策略对象执行。上下文类可以通过依赖注入、简单工厂等方式来获取具体策略对象
- 抽象策略（Abstract Strategy）：定义了策略对象的公共接口或抽象类，规定了具体策略类必须实现的方法
- 具体策略（Concrete Strategy）：实现了抽象策略定义的接口或抽象类，包含了具体的算法实现

### 代码实现

1. 数据DTO

```java
public class Stock {

    // 股票交易代码
    private String code;

    // 现价
    private Double price;

    // 涨幅
    private Double rise;
    
  	// Getter and Setter
}
```

2. 抽象策略接口

```java
public interface Strategy {

    /**
     * 将股票列表排序
     * @param source 源数据
     * @return 排序后的数据
     */
    List<Stock> sort(List<Stock> source);
}
```

3. 策略实现类

```java
/**
 * 高价值排行榜
 */
public class HighPriceRank implements Strategy {
    @Override
    public List<Stock> sort(List<Stock> source) {
        return source.stream()
                .sorted(Comparator.comparing(Stock::getPrice).reversed())
                .collect(Collectors.toList());
    }
}

/**
 * 低价排名
 */
public class LowPriceRank implements Strategy {
    @Override
    public List<Stock> sort(List<Stock> source) {
        return source.stream()
                .sorted(Comparator.comparing(Stock::getPrice))
                .collect(Collectors.toList());
    }
}

/**
 * 高涨幅排名
 */
public class HighRiseRank implements Strategy {
    @Override
    public List<Stock> sort(List<Stock> source) {
        return source.stream()
                .sorted(Comparator.comparing(Stock::getRise).reversed())
                .collect(Collectors.toList());
    }
}
```

4. Context类

```java
/**
 * 策略模式的上下文
 */
public class Context {
    private Strategy strategy;

    public void setStrategy(Strategy strategy) {
        this.strategy = strategy;
    }

    public List<Stock> getRank(List<Stock> source) {
        return strategy.sort(source);
    }
}
```

5. 抽象调用接口

```java
/**
 * 排序服务
 *
 */
public interface RankService {
    List<Stock> sort(String rankType);
}
```

6. 调用实现类

```java
/**
 * 排序服务实现类
 */

@Service
public class RankServiceImpl implements RankService {

    @Autowired
    private List<Stock> source;

    @Override
    public List<Stock> sort(String rankType) {
        // 创建上下文
        Context context = new Context();
        // 选择策略
        switch (rankType) {
            case "HighPrice":
                context.setStrategy(new HighPriceRank());
                break;
            case "LowPrice":
                context.setStrategy(new LowPriceRank());
                break;
            case "HighRise":
                context.setStrategy(new HighRiseRank());
                break;
            default:
                throw new IllegalArgumentException("rankType not found!!!");
        }
        //  执行策略
        return context.getRank(source);
    }
}
```

### 注意

- 经典策略模式，创建了一个接口、三个策略类，还是比较啰嗦的。调用类的实现也待商榷，新增一个策略类还要修改榜单实例

## 枚举策略模式

### 代码实现

1. 枚举策略类

```java
public enum RankEnum {
    // 策略实例
    HighPrice {
        @Override
        public List<Stock> sort(List<Stock> source) {
            return source.stream()
                    .sorted(Comparator.comparing(Stock::getPrice).reversed())
                    .collect(Collectors.toList());
        }
    },
    LowPrice {
        @Override
        public List<Stock> sort(List<Stock> source) {
            return source.stream()
                    .sorted(Comparator.comparing(Stock::getPrice))
                    .collect(Collectors.toList());
        }
    },
    HighRise {
        @Override
        public List<Stock> sort(List<Stock> source) {
            return source.stream()
                    .sorted(Comparator.comparing(Stock::getRise).reversed())
                    .collect(Collectors.toList());
        }
    };

    // 策略接口
    public abstract List<Stock> sort(List<Stock> source);
}
```

2. 调用实现类

```java
@Service
public class RankServiceImpl2 implements RankService {

    @Autowired
    private List<Stock> source;

    @Override
    public List<Stock> sort(String rankType) {
        // 获取策略，若未匹配会抛IllegalArgumentException
        RankEnum rank = RankEnum.valueOf(rankType);
        return rank.sort(source);
    }
}
```

### 注意

- 对这种简单的策略，推荐用枚举进行优化。枚举的本质是创建了一些静态类的集合
- 正确地使用枚举策略模式需要额外考虑以下几点：
    - 枚举的策略类是公用且静态，这意味着这个策略过程不能引入非静态的部分，扩展性受限
    - 策略模式的目标之一，是优秀的扩展性和可维护性，最好能新增或修改某一策略类时，对其他类是无改动的。而枚举策略如果过多或者过程复杂，维护是比较困难的，可维护性受限

## 工厂策略模式

### 代码实现

1. 策略实现类

```java
/**  
 * 高价榜  
 * 注意申明 Service.value = HighPrice,他是我们的key,下同  
 */  
@Service("HighPrice")  
public class HighPriceRank implements Strategy {  
  
    @Override  
    public List<Stock> sort(List<Stock> source) {  
        return source.stream()  
                .sorted(Comparator.comparing(Stock::getPrice).reversed())  
                .collect(Collectors.toList());  
    }  
}  
  
/**  
 * 低价榜  
 */  
@Service("LowPrice")  
public class LowPriceRank implements Strategy {  
  
    @Override  
    public List<Stock> sort(List<Stock> source) {  
        return source.stream()  
                .sorted(Comparator.comparing(Stock::getPrice))  
                .collect(Collectors.toList());  
    }  
}  
  
/**  
 * 高涨幅榜  
 */  
@Service("HighRise")  
public class HighRiseRank implements Strategy {  
  
    @Override  
    public List<Stock> sort(List<Stock> source) {  
        return source.stream()  
                .sorted(Comparator.comparing(Stock::getRise).reversed())  
                .collect(Collectors.toList());  
    }  
}
```

2. 调用实现类（借助spring工厂特性完成注入）

```java
@Service
public class RankServiceImpl3 implements RankService {

    @Autowired
    private List<Stock> source;

    @Autowired
    private Map<String, Strategy> rankMap;

    @Override
    public List<Stock> sort(String rankType) {
        // 获取策略，若未匹配会抛IllegalArgumentException
        if (!rankMap.containsKey(rankType)) {
            throw new IllegalArgumentException("rankType not found");
        }
        // 获取策略实例
        Strategy strategy = rankMap.get(rankType);
        // 执行策略
        return strategy.sort(source);
    }
}
```

### 注意

- 为了解决良好的扩展性和可维护性，可以考虑Spring自带的BeanFactory的优势，实现基于工厂的策略模式；也可以自己实现一个抽象工厂
- 工厂策略模式会比枚举策略模式啰嗦，但也更加灵活、易扩展性和易维护
- 因此，简单策略推荐枚举策略模式，复杂策略才推荐工厂策略模式





































