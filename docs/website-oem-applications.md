# 官网 OEM 申请

三语 `/founding-oem` 表单直接 POST 到同源 `/api/oem-applications`。成功后显示唯一回执，可复制或下载文本控件。失败时保留表单，同一页面重试使用原提交键，防止网络超时造成重复申请。回执表示收件成功，不确认席位或付款。

申请存入官网现有 D1 `omindos-website-visits` 的独立 `oem_applications` 表；访问统计不变。迁移文件为 `migrations/website/0002_oem_applications.sql`，需要在发布表单前应用一次。该 SQL 不随官网静态资源公开。接口验证来源、JSON、字段长度、邮箱、同意状态，限制请求至 32KB；同一来源每小时最多接受 10 份新申请。公开接口只返回回执，GET 不提供申请资料。

管理员在 OA 左侧「官网 OEM 申请」查看资料，按时间分页。需要管理员身份并已完成入职保密签署。成员权限、日常四类审批和旧审批记录不变。

OA 生产发布必须保留新增的 D1 绑定：

```json
{"binding":"WEBSITE_DB","database_name":"omindos-website-visits","database_id":"3651ff92-d9fb-45aa-9d1d-623d25bf3459"}
```

OA 原 `DB` 仍为 `34af7e92-7da5-47cd-b7c0-1270e157c0e6`，不能替换。官网原 `VISITS_DB` 仍指向 `3651ff92-d9fb-45aa-9d1d-623d25bf3459`。部署顺序为 SQL、OA 管理员入口、官网表单。

验证：官网测试涵盖非法输入、跨站请求、超大请求、重复和并发提交、限额；OA 测试涵盖权限隔离和同时间戳分页。表单提供页面和下载回执，不自动发送邮件回执。管理员可按申请邮箱联系申请人。
