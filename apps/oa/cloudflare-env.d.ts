declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    GITHUB_LOGIN_ENABLED?: string;
    GITHUB_OAUTH_CLIENT_ID?: string;
    GITHUB_OAUTH_CLIENT_SECRET?: string;
    FEISHU_LOGIN_ENABLED?: string;
    FEISHU_LOGIN_APP_ID?: string;
    FEISHU_LOGIN_APP_SECRET?: string;
    FEISHU_LOGIN_TENANT_KEY?: string;
    OA_PUBLIC_ORIGIN?: string;
  }
}
