import { getD1Database } from "../../../../db";
import { deactivateMigrationWriteFreeze, isMigrationUnfreezeEnabled, migrationWriteFreezeId } from "../../../../lib/migration-freeze";
import { getAuthorizedUser } from "../../_lib/auth";

const HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "content-type": "application/json; charset=utf-8",
  "cross-origin-resource-policy": "same-origin",
  pragma: "no-cache",
  vary: "Cookie, Origin",
  "x-content-type-options": "nosniff",
};

const HTML_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "content-type": "text/html; charset=utf-8",
  "cross-origin-resource-policy": "same-origin",
  pragma: "no-cache",
  vary: "Cookie",
  "x-content-type-options": "nosniff",
};

function json(message: object, status: number) {
  return Response.json(message, { status, headers: HEADERS });
}

function sameOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  return request.headers.get("origin") === requestOrigin
    && (!request.headers.get("sec-fetch-site") || request.headers.get("sec-fetch-site") === "same-origin");
}

async function migrationEnvironment() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as Record<string, unknown>;
}

export async function GET() {
  if (!isMigrationUnfreezeEnabled(await migrationEnvironment())) return json({ error: "未找到。" }, 404);
  const authorized = await getAuthorizedUser();
  if (!authorized?.isAdmin || !authorized.memberId || !authorized.accountUserId || !authorized.ndaCompleted) return json({ error: "只有已完成保密准入的 OA 管理员可以恢复写入。" }, 403);
  return new Response(`<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>解除数据库迁移栅栏</title></head>
<body>
  <main>
    <h1>解除数据库迁移栅栏</h1>
    <p>本次迁移包已经过期。继续后将停用当前迁移冻结代次；此前下载的迁移包必须销毁。</p>
    <form method="post" action="/api/admin/migration-unfreeze">
      <button type="submit" name="confirmation" value="discard-current-migration-package">确认废弃当前迁移包并解除栅栏</button>
    </form>
  </main>
</body>
</html>`, { status: 200, headers: HTML_HEADERS });
}

export async function POST(request: Request) {
  const environment = await migrationEnvironment();
  if (!isMigrationUnfreezeEnabled(environment)) return json({ error: "未找到。" }, 404);
  if (!sameOrigin(request)) return json({ error: "迁移恢复请求来源无效。" }, 403);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 1_024) return json({ error: "迁移恢复请求无效。" }, 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) return json({ error: "迁移恢复确认格式无效。" }, 415);
  const serializedBody = await request.text();
  if (new TextEncoder().encode(serializedBody).byteLength > 1_024) return json({ error: "迁移恢复请求无效。" }, 413);
  const form = new URLSearchParams(serializedBody);
  if (form.size !== 1 || form.get("confirmation") !== "discard-current-migration-package") return json({ error: "必须确认废弃当前迁移包后才能解除冻结。" }, 400);
  const authorized = await getAuthorizedUser();
  if (!authorized?.isAdmin || !authorized.memberId || !authorized.accountUserId || !authorized.ndaCompleted) return json({ error: "只有已完成保密准入的 OA 管理员可以恢复写入。" }, 403);
  try {
    const freezeId = migrationWriteFreezeId(environment);
    const database = await getD1Database();
    if (!await deactivateMigrationWriteFreeze(database, freezeId)) return json({ error: "当前迁移冻结代次不匹配，未恢复写入。" }, 409);
    return json({ ok: true, message: "数据库迁移栅栏已解除；此前下载的迁移包已经过期并必须销毁，且仍需发布 OA_MIGRATION_WRITE_FROZEN=false 后才恢复网页写入。" }, 200);
  } catch {
    return json({ error: "迁移写入恢复失败；网页入口仍保持冻结。" }, 500);
  }
}
