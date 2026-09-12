---
title: "代码命名：让名字说明意图"
description: "从单字母、缩写、单位到类名，整理代码命名的常见问题。好的名字应帮助读者理解用途，减少额外解释。"
intro: "从单字母、缩写、单位到类名，整理代码命名的常见问题。好的名字应帮助读者理解用途，减少额外解释。"
permalink: programming-ideas/programmingideas/codeaesthetic/namingpatterns/
updated: 2026-09-13
diagram: /images/diagrams/naming-intent.svg
diagram_alt: 让名字承载读者需要的信息。用途；完整含义；量与单位。命名需要上下文；图示用于整理原则，不是机械规则。
diagram_caption: 命名需要上下文；图示用于整理原则，不是机械规则。
related:
  - programming-ideas/programmingideas/cleancode/meaningful-names/
  - programming-ideas/programmingideas/codeaesthetic/nervernester/
featured: 3
quote_attribution: 学习整理自 CodeAesthetic；引言署名 Phil Karlton
kind: note
categories:
  - [Programming Ideas]
tags:
  - [Naming]
  - [Code Aesthetic]
---



> There are only two hard things in computer science: cache invalidation and naming things.		-- Phil Karlton

<!--more-->

> [代码美学：在代码中取名](https://www.bilibili.com/video/BV1nP4y1v7ww/?spm_id_from=333.999.0.0&vd_source=67965098e45142f3b4fb66fb1ceeb39a)
>
> https://youtu.be/-J3wNP6u5YU

- 避免使用单字母
- 避免使用缩写
- 命名不要携带变量类型信息，推荐带上单位
- 如果你不知道基类如何命名，那么你可能需要修改子类的名字
- 尝试将工具类的方法放在不同的类中