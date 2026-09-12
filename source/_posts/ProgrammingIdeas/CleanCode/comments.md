---
title: "什么样的注释值得写？"
description: "整理《代码整洁之道》中关于注释的学习要点：用代码表达意图，识别多余注释，并清理已经失效的注释代码。"
intro: "整理《代码整洁之道》中关于注释的学习要点：用代码表达意图，识别多余注释，并清理已经失效的注释代码。"
permalink: programming-ideas/programmingideas/cleancode/comments/
updated: 2026-09-13
diagram: /images/diagrams/comment-intent.svg
diagram_alt: 写注释之前，先检查表达意图的方式。名字能说清楚吗？；代码能更直接吗？；还缺什么背景？。根据本篇学习要点整理；判断应结合具体代码。
diagram_caption: 根据本篇学习要点整理；判断应结合具体代码。
related:
  - programming-ideas/programmingideas/cleancode/functions/
  - programming-ideas/programmingideas/cleancode/meaningful-names/
featured: 2
quote_attribution: 学习整理自 Robert C. Martin《代码整洁之道》
kind: note
categories:
  - [Programming Ideas]
tags:
  - [Clean Code]



---

# 前言

- 注释的恰当使用是弥补我们在用代码表达意图时遭遇的失败
- 不要滥用注释

<!--more-->

# 用代码来阐述

- 创建一个描述与注释所言同一事物的函数即可，而不是首先想到添加注释

# 坏注释

## 多余的注释

- 不能比代码本身提供更多的信息，没有说明代码的意义，没有给出代码的意图或逻辑
- 比如在简单方法前加注释，在命名规范的成员变量前加注释

## 循规式注释

- 每个函数都要有Javadoc或每个变量都要有注释的规矩是不可取的

## 能用函数或变量时就别用注释

## 注释掉的代码

- 及时删除注释掉的代码，版本控制系统会记住不要的代码































