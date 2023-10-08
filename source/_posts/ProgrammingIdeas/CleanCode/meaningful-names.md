---
title: Meaningful Names
categories:
  - [Programming Ideas]
tags:
  - [Naming]
  - [Clean Code]

---

# 前言

- 关于取名的几条简单规则

<!--more-->

# 避免误导

- 最好别在名称中写出容器类型名，如`accountList`，即使容器就是个`List`
- 提防不同之处太小的名称

# 使用可搜索的名称

- 名称长短应与其作用域大小相对，作用域越小，变量名称越短，如单字母名称仅用于短方法中的本地变量
- 用大写下划线字符常量表示数字常量更便于搜索

# 类名

- 类名和对象名应该是名词或名词短语，如`Customer`、`WikiPage`、`Account`等，避免使用`Manager`、`Processor`、`Data`、`Info`等类名
- 类名不应当是动词

# 方法名

- 方法名应当是动词或动词短语，如`postPayment`、`deletePage`等

# 每个概念对应一个词

- 函数名称应当独一无二，而且要保持一致
- 同一类型的对象应该使用相同的名称后缀，如都使用`Controller`，而不是又有`controller`，也有`manager`、`driver`等





































