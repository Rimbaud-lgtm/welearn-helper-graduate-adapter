# WeLearn 历史执行日志

数据所有者在2026-10-10明确要求将下载目录中的WeLearn日志一并上传并公开。这里收录39份JSON，原文件保持不变。逐文件结构及敏感内容检查未发现账号原文、账号/班级散列、密码、Cookie、令牌、班级链接或答案正文，因此保留字节一致的副本；每份文件的SHA-256见[manifest.json](manifest.json)。

## 内容与用途

日志包含课程题目标识、个人学习进度、成绩、时间、任务随机ID、授权额度、提交计数及错误。公开这些学习记录经过本次明确授权；不代表其他用户日志也可以直接公开。

它们是不同时间的快照，同一练习会重复出现，不能跨文件相加得出提交数。用于诊断，不可导入扩展恢复任务或解锁验证能力。安装ZIP不包含这些日志。早期文件结构较少，null表示缺失或当时未连接，不能据此认定原记录被删除。

## 如何读

- progress：最近一次官方目录读数及读取时间，可能早于导出。
- current/connection：导出时连接；空值不代表已经完成。
- rows[].clickCount：扩展记录的提交次数；输入核验不等于提交。
- rows[].result：WeLearn实际结果；kind=ungraded仅有时间，不得当成100%。
- history：保留窗口内的事件，包括UI_LAUNCH_ACCEPTED（仅接收启动）、原生提交、结果、目录对账和错误。
- run.done：当前一次运行的计数，用户恢复可能产生新run；不能直接当作整日新增。
- consent.used：累计授权消耗，结果不明确时不能重置来重试。

## 最后一个已归档快照

最新文件记录官方155/225。相对本次接管目录34，新增121个完成标记；其中80项可由本次扩展账本证明为新单次提交，650/650输入回读通过，44项系统评分368/368、全部100%，其余36项只有完成时间。其他41个目录变化含正文学习和用户操作，不能全部算作扩展Submit。这个结果不保证其他账户或题目同样正确。

授权总额191，已消耗80，剩111；侧栏还有70项待人工。最后一题已真实判分并目录确认，随后出现NO_AUTHORIZED_UNFINISHED。之后的SESSION_ENDED将界面显示为暂停，这是保留的已知异常，不能用完成结果掩盖失败，也不能误当作提交失败重提。

## 文件索引

| 文件 | 版本 | 官方完成数 | 运行状态 |
|---|---|---:|---|
| [welearn-extension-audit-1791617027205.json](welearn-extension-audit-1791617027205.json) | 0.3.2-preview.1 | 未读到 | paused |
| [welearn-extension-audit-1791617909343.json](welearn-extension-audit-1791617909343.json) | 0.3.2-preview.1 | 未读到 | paused |
| [welearn-extension-audit-1791618461743.json](welearn-extension-audit-1791618461743.json) | 0.3.2-preview.1 | 14 | completed |
| [welearn-extension-audit-1791619080829.json](welearn-extension-audit-1791619080829.json) | 0.3.2-preview.1 | 14 | paused |
| [welearn-extension-audit-1791619412743.json](welearn-extension-audit-1791619412743.json) | 0.3.2-preview.1 | 16 | completed |
| [welearn-extension-audit-1791619661943.json](welearn-extension-audit-1791619661943.json) | 0.3.2-preview.1 | 20 | completed |
| [welearn-extension-audit-1791620582261.json](welearn-extension-audit-1791620582261.json) | 0.3.2-preview.1 | 未读到 | paused |
| [welearn-extension-audit-1791620955563.json](welearn-extension-audit-1791620955563.json) | 0.3.3-preview.1 | 21 | completed |
| [welearn-extension-audit-1791621114469.json](welearn-extension-audit-1791621114469.json) | 0.3.3-preview.1 | 未读到 | paused |
| [welearn-extension-audit-1791621790825.json](welearn-extension-audit-1791621790825.json) | 0.3.4-preview.1 | 未读到 | paused |
| [welearn-extension-audit-1791622229494.json](welearn-extension-audit-1791622229494.json) | 0.3.4-preview.1 | 未读到 | paused |
| [welearn-extension-audit-1791622595192.json](welearn-extension-audit-1791622595192.json) | 0.3.5-preview.1 | 未读到 | paused |
| [welearn-extension-audit-1791622837558.json](welearn-extension-audit-1791622837558.json) | 0.3.5-preview.1 | 29 | completed |
| [welearn-extension-audit-1791623015931.json](welearn-extension-audit-1791623015931.json) | 0.3.5-preview.1 | 30 | completed |
| [welearn-extension-audit-1791623360702.json](welearn-extension-audit-1791623360702.json) | 0.3.6-preview.1 | 32 | completed |
| [welearn-extension-audit-1791623679369.json](welearn-extension-audit-1791623679369.json) | 0.3.7-preview.1 | 32 | completed |
| [welearn-extension-audit-1791623891067.json](welearn-extension-audit-1791623891067.json) | 0.3.7-preview.1 | 32 | completed |
| [welearn-extension-audit-1791624497263.json](welearn-extension-audit-1791624497263.json) | 0.3.7-preview.1 | 32 | completed |
| [welearn-extension-audit-1791625871444.json](welearn-extension-audit-1791625871444.json) | 0.3.8-preview.1 | 33 | completed |
| [welearn-extension-audit-1791628464654.json](welearn-extension-audit-1791628464654.json) | 0.3.8-preview.1 | 34 | completed |
| [welearn-extension-audit-1791630270610.json](welearn-extension-audit-1791630270610.json) | 0.3.9-preview.1 | 34 | paused |
| [welearn-extension-audit-1791631481001.json](welearn-extension-audit-1791631481001.json) | 0.3.9-preview.1 | 34 | paused |
| [welearn-extension-audit-1791631954733.json](welearn-extension-audit-1791631954733.json) | 0.3.9-preview.1 | 34 | paused |
| [welearn-extension-audit-1791632903414.json](welearn-extension-audit-1791632903414.json) | 0.3.9-preview.1 | 34 | paused |
| [welearn-extension-audit-1791633258030.json](welearn-extension-audit-1791633258030.json) | 0.3.9-preview.1 | 34 | paused |
| [welearn-extension-audit-1791633757932.json](welearn-extension-audit-1791633757932.json) | 0.3.9-preview.2 | 34 | waiting_navigation |
| [welearn-extension-audit-1791633816198.json](welearn-extension-audit-1791633816198.json) | 0.3.9-preview.2 | 34 | waiting_navigation |
| [welearn-extension-audit-1791634301077.json](welearn-extension-audit-1791634301077.json) | 0.3.9-preview.2 | 43 | paused |
| [welearn-extension-audit-1791634770763.json](welearn-extension-audit-1791634770763.json) | 0.3.9-preview.2 | 46 | paused |
| [welearn-extension-audit-1791635248667.json](welearn-extension-audit-1791635248667.json) | 0.3.9-preview.2 | 58 | waiting_navigation |
| [welearn-extension-audit-1791635361662.json](welearn-extension-audit-1791635361662.json) | 0.3.9-preview.2 | 63 | paused |
| [welearn-extension-audit-1791635677690.json](welearn-extension-audit-1791635677690.json) | 0.3.9-preview.2 | 86 | waiting_empty |
| [welearn-extension-audit-1791635957389.json](welearn-extension-audit-1791635957389.json) | 0.3.9-preview.2 | 106 | waiting_empty |
| [welearn-extension-audit-1791636162628.json](welearn-extension-audit-1791636162628.json) | 0.3.9-preview.2 | 121 | waiting_navigation |
| [welearn-extension-audit-1791636298179.json](welearn-extension-audit-1791636298179.json) | 0.3.9-preview.2 | 129 | returning_skip |
| [welearn-extension-audit-1791636481371.json](welearn-extension-audit-1791636481371.json) | 0.3.9-preview.2 | 133 | paused |
| [welearn-extension-audit-1791636718912.json](welearn-extension-audit-1791636718912.json) | 0.3.9-preview.2 | 146 | waiting_directory |
| [welearn-extension-audit-1791636868256.json](welearn-extension-audit-1791636868256.json) | 0.3.9-preview.2 | 154 | running |
| [welearn-extension-audit-1791636980655.json](welearn-extension-audit-1791636980655.json) | 0.3.9-preview.2 | 155 | paused |
