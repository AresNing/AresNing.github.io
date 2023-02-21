---
title: Never Nester
categories:
  - [Programming Ideas]
tags:
  - [Naming]
  - [Ode Aesthetic]
---



<!--more-->

> [代码美学：为何要成为“不嵌套主义者”](https://www.bilibili.com/video/BV1ov4y167WE/?spm_id_from=333.788&vd_source=67965098e45142f3b4fb66fb1ceeb39a)
>
> https://youtu.be/CFRhGnuXG-4



# 消除嵌套的方法

## 条件反转

- guard语句
- 验证守护 validation gatekeeping
- error first 风格
- return early 尽早返回

## 提炼子函数

>评论区：
>
>0、如何硬着头皮开始？首先要有信念。
>众所周知，代码在编译时会首先得到AST，这意味着任何复杂函数都可以抽象成最简单的两两关系——我们不会做得这么绝，但是务必要有这样的信心。
>
>1、如何判断一个函数是否需要抽象？可以把“50行”当作一个指标。
>20年前一些老派的公司做CodeReview时，会把代码打印到纸上。如果哪个函数长到需要翻页才能看全，Reviewer就会摆出嫌弃的表情，然后把你挂掉。
>
>2、如何判断提炼的子函数的好坏？有两个硬指标：
>一是子函数依赖的参数个数，二是子函数的复用次数。
>子函数复用越多，参数越少，就说明拆解越是有效。
>
>3、当你提炼出多个子函数，而它们之间使用到的参数有相似之处时，可以将它们进一步抽象成类。
>类就是绑定在数据上的函数。
>
>4、可以用Map、Reduce、Filter这些高阶函数配合Lambda表达式来代替简单循环，在处理缺乏抽象的数据结构时有奇效。如果你的语言是C#，请务必尽可能大胆地使用LInQ；Python可以适当运用列表推导式，但要顾及同事的感受。