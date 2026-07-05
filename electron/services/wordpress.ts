import axios, { AxiosInstance } from "axios";
import type {
  WordPressConnectionTestResult,
  WpContentItem
} from "../types";

interface WpCredentials {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

/** Normalizes a user-entered site URL into a clean https base with no trailing slash. */
function normalizeSiteUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
}

function buildClient(creds: WpCredentials): AxiosInstance {
  const basicAuth = Buffer.from(
    `${creds.username}:${creds.applicationPassword}`
  ).toString("base64");

  return axios.create({
    baseURL: `${normalizeSiteUrl(creds.siteUrl)}/wp-json`,
    timeout: 20000,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "User-Agent": "WP-AI-Image-Publisher/0.1"
    },
    validateStatus: () => true // we inspect status codes ourselves for clearer diagnostics
  });
}

/**
 * Runs the full connection test WordPress needs to verify before the app
 * will allow loading content or running bulk jobs against a site:
 *   1. REST API reachable at all (no auth required for this check)
 *   2. Authentication works (application password accepted)
 *   3. User can read pages/posts
 *   4. User can upload media (checked via capability, not an actual upload)
 *   5. User can update pages/posts (checked via capability)
 */
export async function testWordPressConnection(
  creds: WpCredentials
): Promise<WordPressConnectionTestResult> {
  const result: WordPressConnectionTestResult = {
    ok: false,
    steps: {
      restApiReachable: false,
      authenticationValid: false,
      canReadContent: false,
      canUploadMedia: false,
      canUpdateContent: false
    },
    errors: []
  };

  const client = buildClient(creds);

  // Step 1: REST API reachable (public root endpoint, no auth needed)
  try {
    const rootRes = await client.get("/");
    if (rootRes.status >= 200 && rootRes.status < 300) {
      result.steps.restApiReachable = true;
      result.siteInfo = {
        name: rootRes.data?.name ?? normalizeSiteUrl(creds.siteUrl)
      };
    } else {
      result.errors.push(
        `REST API root returned HTTP ${rootRes.status}. Is WordPress REST API enabled/unblocked?`
      );
      return result;
    }
  } catch (err) {
    result.errors.push(
      `Could not reach the WordPress REST API. Check the site URL and that it's publicly accessible. (${describeError(err)})`
    );
    return result;
  }

  // Step 2: Authentication — /wp/v2/users/me requires valid credentials
  let currentUser: { id: number; capabilities?: Record<string, boolean> } | null = null;
  try {
    const meRes = await client.get("/wp/v2/users/me", {
      params: { context: "edit" }
    });
    if (meRes.status === 200) {
      result.steps.authenticationValid = true;
      currentUser = meRes.data;
    } else if (meRes.status === 401 || meRes.status === 403) {
      result.errors.push(
        "Authentication failed. Verify the username and Application Password are correct."
      );
      return result;
    } else {
      result.errors.push(`Unexpected authentication response: HTTP ${meRes.status}`);
      return result;
    }
  } catch (err) {
    result.errors.push(`Authentication request failed. (${describeError(err)})`);
    return result;
  }

  // Step 3: Can read pages/posts
  try {
    const pagesRes = await client.get("/wp/v2/pages", { params: { per_page: 1 } });
    const postsRes = await client.get("/wp/v2/posts", { params: { per_page: 1 } });
    if (pagesRes.status === 200 && postsRes.status === 200) {
      result.steps.canReadContent = true;
    } else {
      result.errors.push(
        `Reading content failed (pages: HTTP ${pagesRes.status}, posts: HTTP ${postsRes.status}).`
      );
    }
  } catch (err) {
    result.errors.push(`Could not read pages/posts. (${describeError(err)})`);
  }

  // Step 4 & 5: Upload media / update content — inferred from the
  // authenticated user's WordPress capabilities rather than performing a
  // real write, so testing a connection never creates test data on the
  // live site.
  const caps = currentUser?.capabilities ?? {};
  const canUpload = Boolean(caps["upload_files"]);
  const canEditPosts = Boolean(caps["edit_posts"] || caps["edit_pages"]);

  result.steps.canUploadMedia = canUpload;
  result.steps.canUpdateContent = canEditPosts;

  if (!canUpload) {
    result.errors.push(
      "This WordPress user does not appear to have permission to upload media (upload_files capability missing)."
    );
  }
  if (!canEditPosts) {
    result.errors.push(
      "This WordPress user does not appear to have permission to edit pages/posts."
    );
  }

  result.ok =
    result.steps.restApiReachable &&
    result.steps.authenticationValid &&
    result.steps.canReadContent &&
    result.steps.canUploadMedia &&
    result.steps.canUpdateContent;

  return result;
}

interface WpRestContentRecord {
  id: number;
  slug: string;
  status: string;
  type: string;
  link: string;
  modified: string;
  title: { rendered: string };
  featured_media: number;
  categories?: number[];
  tags?: number[];
}

/**
 * Loads all pages and posts for a site (paginated internally) and maps
 * them into the app's normalized WpContentItem shape. RankMath/Yoast SEO
 * fields are opportunistically read if those plugins expose them in the
 * REST response (`rank_math_title`, `yoast_head_json`, etc.) — absence of
 * those fields is not treated as an error.
 */
export async function loadWebsiteContent(
  creds: WpCredentials
): Promise<Omit<WpContentItem, "websiteId">[]> {
  const client = buildClient(creds);
  const items: Omit<WpContentItem, "websiteId">[] = [];

  for (const type of ["pages", "posts"] as const) {
    let page = 1;
    const perPage = 50;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await client.get<WpRestContentRecord[]>(`/wp/v2/${type}`, {
        params: {
          per_page: perPage,
          page,
          status: "any",
          context: "edit"
        }
      });

      if (res.status !== 200) {
        // 400 on a page number past the last page is WordPress's normal
        // "no more pages" signal — treat it as end of pagination, not an error.
        if (res.status === 400 && page > 1) break;
        throw new Error(`Failed to load ${type} (HTTP ${res.status}) on page ${page}`);
      }

      const records = res.data;
      if (!Array.isArray(records) || records.length === 0) break;

      for (const record of records) {
        const anyRecord = record as unknown as Record<string, unknown>;
        items.push({
          id: record.id,
          type: type === "pages" ? "page" : "post",
          title: decodeHtmlEntities(record.title?.rendered ?? "(untitled)"),
          slug: record.slug,
          url: record.link,
          status: record.status,
          modifiedAt: record.modified,
          featuredImageId: record.featured_media || null,
          existingImageCount: null, // computed later during Page Analysis (Phase 2)
          categories: [], // resolved via /wp/v2/categories in a follow-up call if needed
          tags: [],
          seoTitle:
            (anyRecord["rank_math_title"] as string | undefined) ??
            (anyRecord["yoast_title"] as string | undefined) ??
            null,
          seoMeta:
            (anyRecord["rank_math_description"] as string | undefined) ??
            (anyRecord["yoast_description"] as string | undefined) ??
            null
        });
      }

      const totalPagesHeader = res.headers["x-wp-totalpages"];
      const totalPages = totalPagesHeader ? parseInt(String(totalPagesHeader), 10) : page;
      if (page >= totalPages) break;
      page += 1;
    }
  }

  return items;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "–")
    .replace(/&#8220;/g, "\u201c")
    .replace(/&#8221;/g, "\u201d")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === "ECONNABORTED") return "request timed out";
    if (err.code === "ENOTFOUND") return "domain not found (DNS)";
    if (err.code === "ECONNREFUSED") return "connection refused";
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
