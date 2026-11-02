---
title: 数学公式示例
date: "2026-01-01"
description: 演示构建时渲染的 LaTeX 数学公式。
tags: [写作, 数学]
publish: true
---

行内公式：勾股定理为 $a^2+b^2=c^2$。

独立公式：

$$
E = mc^2
$$

多行对齐：

$$
\begin{aligned}
(a+b)^2 &= a^2+2ab+b^2 \\
\sum_{k=1}^{n} k &= \frac{n(n+1)}{2}
\end{aligned}
$$

较长的公式应能在窄屏中横向滚动：

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi} \quad\text{and}\quad \sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}
$$

普通金额写成 \$20；代码中的 `$a^2$` 应保持原样：

```text
$a^2$ is shown as code, not as a formula.
```
