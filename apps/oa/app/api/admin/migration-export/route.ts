import { getD1Database } from "../../../../db";
import {
  buildMigrationPayload,
  assertMigrationAdministratorCanReenter,
  canonicalJson,
  encryptMigrationPayload,
  getMigrationExportConfig,
  isMigrationExportWindowOpen,
  MIGRATION_EXPORT_TABLES,
  migrationLedgerSelectSql,
  migrationFreezeMarkerSelectSql,
  migrationArchiveActivitySelectSql,
  migrationExportSelectSql,
  migrationSchemaSelectSql,
} from "../../../../lib/migration-export.mjs";
import { migrationWriteFreezeId } from "../../../../lib/migration-freeze";
import { getAuthorizedUser } from "../../_lib/auth";

function responseHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "cache-control": "private, no-store, max-age=0",
    "content-type": contentType,
    "cross-origin-resource-policy": "same-origin",
    pragma: "no-cache",
    vary: "Cookie, Origin",
    "x-content-type-options": "nosniff",
  };
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: responseHeaders() });
}

function requestIsSameOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === requestOrigin && (!fetchSite || fetchSite === "same-origin");
}

export async function POST(request: Request) {
  if (!isMigrationExportWindowOpen()) return jsonError("未找到。", 404);
  if (!requestIsSameOrigin(request)) return jsonError("迁移下载请求来源无效。", 403);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > 1_024) return jsonError("迁移下载请求无效。", 413);

  const authorized = await getAuthorizedUser({ readOnly: true });
  if (!authorized?.isAdmin || !authorized.memberId || !authorized.accountUserId || !authorized.ndaCompleted) return jsonError("只有已完成保密准入的 OA 管理员可以下载迁移包。", 403);

  try {
    const config = getMigrationExportConfig();
    const requestOrigin = new URL(request.url).origin;
    if (!config || config.sourceOrigin !== requestOrigin) return jsonError("迁移下载源站配置不匹配。", 503);
    const database = await getD1Database();

    const freezeId = migrationWriteFreezeId(process.env);
    const statements = [
      database.prepare(migrationLedgerSelectSql()),
      database.prepare(migrationSchemaSelectSql()),
      database.prepare(migrationFreezeMarkerSelectSql()).bind(freezeId),
      database.prepare(migrationArchiveActivitySelectSql()),
      ...MIGRATION_EXPORT_TABLES.map((table) => database.prepare(migrationExportSelectSql(table))),
    ];
    const batchResults = await database.batch(statements);
    const payload = await buildMigrationPayload({
      sourceOrigin: requestOrigin,
      authKey: config.authKey,
      freezeId: config.freezeId,
      notBefore: config.notBefore,
      notAfter: config.notAfter,
      expectedSchemaSha256: config.expectedSchemaSha256,
      batchResults,
    });
    assertMigrationAdministratorCanReenter(payload, authorized.memberId, authorized.accountUserId);
    const envelope = await encryptMigrationPayload(payload, config.publicKeyJwk);
    const body = canonicalJson(envelope);
    const timestamp = payload.exportedAt.replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
    const headers = new Headers(responseHeaders("application/vnd.originmind.oa-migration+json"));
    headers.set("content-disposition", `attachment; filename="originmind-oa-migration-${timestamp}.json.enc"`);
    return new Response(body, { status: 200, headers });
  } catch {
    return jsonError("迁移包生成失败，请保持页面开启并联系维护人员。", 500);
  }
}
