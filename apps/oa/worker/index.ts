/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { legacyOaRedirect } from "../lib/legacy-oa-redirect.mjs";
import { deactivateMigrationWriteFreeze, ensureMigrationWriteFreezeMarker, isMigrationWriteFrozen, migrationControlPlaneUnfreezeState, shouldBlockForMigrationFreeze, shouldServeMigrationRecoveryPage } from "../lib/migration-freeze";
import { archiveApprovalPdfsToFeishu, type FeishuArchiveEnv } from "../lib/feishu-drive-archive";
import { processApprovalNotifications } from "../lib/feishu-notifications";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  OA_MIGRATION_WRITE_FROZEN?: string;
  OA_MIGRATION_UNFREEZE_ENABLED?: string;
  OA_MIGRATION_EXPORT_NOT_AFTER?: string;
  OA_MIGRATION_CONTROL_UNFREEZE_ID?: string;
  OA_LEGACY_REDIRECT_ENABLED?: string;
  OA_MIGRATION_FREEZE_ID?: string;
  FEISHU_PDF_ARCHIVE_ENABLED?: string;
  FEISHU_LOGIN_APP_ID?: string;
  FEISHU_LOGIN_APP_SECRET?: string;
  FEISHU_LOGIN_TENANT_KEY?: string;
  FEISHU_NOTIFICATIONS_ENABLED?: string;
  OA_ADMIN_EMAILS?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function withSecurityHeaders(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", "default-src 'self'; base-uri 'self'; form-action 'self' https://github.com/login/oauth/authorize https://accounts.feishu.cn https://passport.feishu.cn; frame-src https://passport.feishu.cn; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://lf-package-cn.feishucdn.com; connect-src 'self'; upgrade-insecure-requests");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("referrer-policy", "same-origin");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  if (new URL(request.url).pathname.startsWith("/api/")) {
    headers.set("cache-control", "private, no-store, max-age=0");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isApprovalJsonResponse(request: Request, response: Response) {
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return false;
  const pathname = new URL(request.url).pathname;
  return pathname === "/api/approvals" || /^\/api\/approvals\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(pathname);
}

function migrationRecoveryPage(request: Request) {
  return withSecurityHeaders(request, new Response(`<!doctype html>
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
</html>`, {
    status: 200,
    headers: { "cache-control": "private, no-store, max-age=0", "content-type": "text/html; charset=utf-8" },
  }));
}

async function controlPlaneMigrationUnfreeze(request: Request, env: Env, freezeId: string) {
  let released = false;
  try {
    released = await deactivateMigrationWriteFreeze(env.DB, freezeId);
  } catch {
    // Fail closed. The execute latch keeps every request in maintenance mode.
  }
  const readOnlyRequest = request.method === "GET" || request.method === "HEAD";
  return withSecurityHeaders(request, Response.json(
    released
      ? { ok: true, maintenance: true, message: "数据库迁移栅栏已停用；网页写入仍等待控制面关闭冻结。" }
      : { error: "迁移恢复控制未就绪；网页写入仍保持冻结。" },
    {
      status: released && readOnlyRequest ? 200 : 503,
      headers: { "cache-control": "private, no-store, max-age=0", "retry-after": "60" },
    },
  ));
}

async function archiveApprovalsFromResponse(response: Response, env: Env) {
  try {
    const body = await response.json() as {
      approval?: { id?: unknown; status?: unknown };
      approvals?: Array<{ id?: unknown; status?: unknown }>;
    };
    const candidates = [
      ...(body.approval ? [body.approval] : []),
      ...(Array.isArray(body.approvals) ? body.approvals : []),
    ];
    const ids = candidates.flatMap((approval) => approval.status === "已归档" && typeof approval.id === "string" ? [approval.id] : []);
    if (!ids.length) return;
    await archiveApprovalPdfsToFeishu(env as FeishuArchiveEnv, ids);
  } catch {
    // The business response is already committed. The archive ledger records
    // retryable failures and a later list/detail request safely retries them.
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!isMigrationWriteFrozen(env as unknown as Record<string, unknown>)) ctx.waitUntil(processApprovalNotifications(env));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const controlPlaneUnfreeze = migrationControlPlaneUnfreezeState(env as unknown as Record<string, unknown>);
    if (controlPlaneUnfreeze.armed) {
      if (!controlPlaneUnfreeze.freezeId) {
        return withSecurityHeaders(request, Response.json(
          { error: "迁移恢复控制未就绪；网页写入仍保持冻结。" },
          { status: 503, headers: { "cache-control": "private, no-store, max-age=0", "retry-after": "60" } },
        ));
      }
      return controlPlaneMigrationUnfreeze(request, env, controlPlaneUnfreeze.freezeId);
    }
    const legacyRedirect = legacyOaRedirect(request, env.OA_LEGACY_REDIRECT_ENABLED);
    if (legacyRedirect) return legacyRedirect;
    const url = new URL(request.url);

    if (shouldServeMigrationRecoveryPage(request, env as unknown as Record<string, unknown>)) {
      return migrationRecoveryPage(request);
    }

    if (isMigrationWriteFrozen(env as unknown as Record<string, unknown>)) {
      try {
        await ensureMigrationWriteFreezeMarker(env.DB, env as unknown as Record<string, unknown>);
      } catch {
        if (request.method === "POST" && url.pathname === "/api/admin/migration-export") {
          return withSecurityHeaders(request, Response.json({ error: "迁移冻结计时尚未建立，请稍后重试。" }, { status: 503 }));
        }
      }
    }

    if (shouldBlockForMigrationFreeze(request, env as unknown as Record<string, unknown>)) {
      return withSecurityHeaders(request, Response.json(
        { error: "OA 正在生成迁移快照，暂时停止写入；请勿重复提交，稍后刷新。" },
        { status: 503, headers: { "retry-after": "300" } },
      ));
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(request, response);
    }

    const response = await handler.fetch(request, env, ctx);
    if (isApprovalJsonResponse(request, response)) ctx.waitUntil(archiveApprovalsFromResponse(response.clone(), env));
    if (response.ok && request.method !== "GET" && (url.pathname.startsWith("/api/approvals") || url.pathname === "/api/admin/notifications")) ctx.waitUntil(processApprovalNotifications(env));
    return withSecurityHeaders(request, response);
  },
};

export default worker;
