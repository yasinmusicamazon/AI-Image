import axios, { AxiosInstance } from "axios";
import fs from "fs";
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

/** Fetches full raw content (edit context) plus extracted H2 headings for one page/post. */
export async function getContentDetail(
  creds: WpCredentials,
  contentId: number,
  type: "page" | "post"
): Promise<{ rawContent: string; title: string; slug: string; featuredMedia: number | null }> {
  const client = buildClient(creds);
  const endpoint = type === "page" ? "pages" : "posts";
  const res = await client.get(`/wp/v2/${endpoint}/${contentId}`, { params: { context: "edit" } });

  if (res.status !== 200) {
    throw new Error(`Failed to load content detail (HTTP ${res.status})`);
  }

  return {
    rawContent: res.data?.content?.raw ?? res.data?.content?.rendered ?? "",
    title: res.data?.title?.raw ?? res.data?.title?.rendered ?? "",
    slug: res.data?.slug ?? "",
    featuredMedia: res.data?.featured_media || null
  };
}

/**
 * Uploads a processed image file to the WordPress Media Library, then
 * patches title/alt/caption/description in a follow-up request (WordPress's
 * media POST endpoint only reliably accepts the binary + Content-Disposition
 * filename on creation; richer metadata fields are safest set via PATCH).
 */
export async function uploadMedia(
  creds: WpCredentials,
  filePath: string,
  fileName: string,
  mimeType: string,
  meta: { title: string; altText: string; caption: string; description: string }
): Promise<{ id: number; sourceUrl: string }> {
  const client = buildClient(creds);
  const fileBuffer = fs.readFileSync(filePath);

  const createRes = await client.post(`/wp/v2/media`, fileBuffer, {
    headers: {
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": mimeType
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  if (createRes.status !== 200 && createRes.status !== 201) {
    throw new Error(
      `Media upload failed (HTTP ${createRes.status}): ${JSON.stringify(createRes.data).slice(0, 300)}`
    );
  }

  const mediaId = createRes.data.id;
  const sourceUrl = createRes.data.source_url;

  const patchRes = await client.post(`/wp/v2/media/${mediaId}`, {
    title: meta.title,
    alt_text: meta.altText,
    caption: meta.caption,
    description: meta.description
  });

  if (patchRes.status !== 200) {
    // Non-fatal: the media exists and is usable, just missing some metadata.
    // Surface this as a soft warning rather than failing the whole upload.
    return { id: mediaId, sourceUrl };
  }

  return { id: mediaId, sourceUrl: patchRes.data?.source_url ?? sourceUrl };
}

/** Updates a page/post's content (and optionally featured image) via the REST API. */
export async function updateContent(
  creds: WpCredentials,
  contentId: number,
  type: "page" | "post",
  updates: { content?: string; featuredMedia?: number }
): Promise<void> {
  const client = buildClient(creds);
  const endpoint = type === "page" ? "pages" : "posts";

  const body: Record<string, unknown> = {};
  if (updates.content !== undefined) body.content = updates.content;
  if (updates.featuredMedia !== undefined) body.featured_media = updates.featuredMedia;

  const res = await client.post(`/wp/v2/${endpoint}/${contentId}`, body);

  if (res.status !== 200) {
    throw new Error(`Failed to update content (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`);
  }
}

/**
 * Builds a Gutenberg image block. Falls back to a plain HTML <img> tag
 * (still valid inside Gutenberg's "Custom HTML" flow / classic content)
 * if the caller indicates block insertion isn't appropriate.
 */
export function buildImageMarkup(
  mediaId: number,
  imageUrl: string,
  altText: string,
  caption: string,
  useGutenbergBlock = true
): string {
  const escapedAlt = altText.replace(/"/g, "&quot;");
  if (useGutenbergBlock) {
    const figcaption = caption ? `<figcaption class="wp-element-caption">${caption}</figcaption>` : "";
    return `<!-- wp:image {"id":${mediaId},"sizeSlug":"large","linkDestination":"none"} -->\n<figure class="wp-block-image size-large"><img src="${imageUrl}" alt="${escapedAlt}" class="wp-image-${mediaId}"/>${figcaption}</figure>\n<!-- /wp:image -->`;
  }
  return `<img src="${imageUrl}" alt="${escapedAlt}" class="wp-image-${mediaId}" />`;
}

/**
 * Inserts image markup into raw WordPress content according to a
 * placement rule. This uses heuristic text matching (H2 boundaries, a
 * "FAQ" heading, or the last block before the end of content as a stand-in
 * for "before final CTA") rather than true content understanding — it is
 * a best-effort placement, and manual_only always skips insertion so the
 * person can place the image themselves.
 *
 * Returns null (no change) if the image URL is already present in the
 * content, to avoid duplicate insertion.
 */
export function insertImageIntoContent(
  rawContent: string,
  imageMarkup: string,
  imageUrl: string,
  placement: string
): { updatedContent: string; inserted: boolean; note: string } {
  if (rawContent.includes(imageUrl)) {
    return { updatedContent: rawContent, inserted: false, note: "Image URL already present in content; skipped to avoid duplicate." };
  }

  if (placement === "featured_image" || placement === "manual_only") {
    return { updatedContent: rawContent, inserted: false, note: "Placement does not require inline insertion." };
  }

  const h2Matches = [...rawContent.matchAll(/<!--\s*\/wp:heading\s*-->/gi)];
  // Fallback for content without explicit heading blocks (plain HTML h2s).
  const plainH2Matches = [...rawContent.matchAll(/<\/h2>/gi)];

  function insertAfterIndex(matches: RegExpMatchArray[], n: number): string | null {
    if (matches.length < n) return null;
    const match = matches[n - 1];
    const insertAt = (match.index ?? 0) + match[0].length;
    return rawContent.slice(0, insertAt) + "\n" + imageMarkup + "\n" + rawContent.slice(insertAt);
  }

  if (placement === "after_first_h2") {
    const result = insertAfterIndex(h2Matches, 1) ?? insertAfterIndex(plainH2Matches, 1);
    if (result) return { updatedContent: result, inserted: true, note: "Inserted after first H2." };
  }

  if (placement === "after_second_h2") {
    const result = insertAfterIndex(h2Matches, 2) ?? insertAfterIndex(plainH2Matches, 2);
    if (result) return { updatedContent: result, inserted: true, note: "Inserted after second H2." };
  }

  if (placement === "before_faq") {
    const faqIndex = rawContent.search(/<h2[^>]*>\s*(frequently asked questions|faq)/i);
    if (faqIndex >= 0) {
      const updated = rawContent.slice(0, faqIndex) + imageMarkup + "\n" + rawContent.slice(faqIndex);
      return { updatedContent: updated, inserted: true, note: "Inserted before FAQ heading." };
    }
  }

  if (placement === "before_final_cta") {
    // Heuristic: insert before the last H2, or before the last 20% of
    // content if no heading is found — approximating "near the end,
    // before a closing call-to-action section."
    if (h2Matches.length > 0) {
      const lastMatch = h2Matches[h2Matches.length - 1];
      const insertAt = lastMatch.index ?? rawContent.length;
      const updated = rawContent.slice(0, insertAt) + imageMarkup + "\n" + rawContent.slice(insertAt);
      return { updatedContent: updated, inserted: true, note: "Inserted before final heading (approximation of 'before final CTA')." };
    }
  }

  // Fallback: append at the end with a note that automatic placement failed.
  return {
    updatedContent: rawContent + "\n" + imageMarkup,
    inserted: true,
    note: `Could not find a matching location for placement "${placement}"; appended to the end of the content instead.`
  };
}
