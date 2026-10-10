import type { FetchDeadline } from "../../types";
import { fetchJson } from "../httpClient";
import type { FetchZyvopPostsPage, ZyvopPost } from "./types";

// ZyVOP has no read REST endpoint for posts; its hosted MCP server is the
// supported read path. It answers plain JSON-RPC over POST with no session
// handshake, so a single fetch per tool call is enough.
const ZYVOP_MCP_URL = "https://zyvop.com/mcp";
const JSON_RPC_VERSION = "2.0";
const TOOLS_CALL_METHOD = "tools/call";
const LIST_POSTS_TOOL = "zyvop_list_posts";
const PUBLISHED_STATUS = "PUBLISHED";
const VENDOR_LABEL = "ZyVOP MCP";
// The tool's documented maximum; it rejects anything larger.
export const POSTS_PAGE_SIZE = 50;

interface ToolTextContent {
  type: string;
  text?: string;
}

interface JsonRpcResponse {
  error?: { code: number; message: string };
  result?: { content?: ToolTextContent[]; isError?: boolean };
}

function toolResultText(body: JsonRpcResponse): string {
  if (body.error) {
    throw new Error(
      `${VENDOR_LABEL} returned JSON-RPC error ${body.error.code}: ${body.error.message}`,
    );
  }
  const text = body.result?.content?.find((item) => item.type === "text")?.text;
  // A failed tool call still comes back as HTTP 2xx, flagged only by
  // isError with the reason in the text content.
  if (body.result?.isError) {
    throw new Error(`${VENDOR_LABEL} ${LIST_POSTS_TOOL} failed: ${text}`);
  }
  if (text === undefined) {
    throw new Error(`${VENDOR_LABEL} ${LIST_POSTS_TOOL} returned no text.`);
  }
  return text;
}

function parsePosts(text: string): ZyvopPost[] {
  try {
    return (JSON.parse(text) as { posts: ZyvopPost[] }).posts;
  } catch (cause) {
    throw new Error(
      `${VENDOR_LABEL} ${LIST_POSTS_TOOL} returned text that isn't valid JSON.`,
      { cause },
    );
  }
}

/**
 * Builds the real, network-touching `FetchZyvopPostsPage`. `fetchImpl`
 * defaults to the global `fetch` but is injectable so this can be tested
 * without a live call, same as devtoClient.ts.
 */
export function createZyvopPostsPageFetcher(
  token: string,
  fetchImpl: typeof fetch = fetch,
  deadline?: FetchDeadline,
): FetchZyvopPostsPage {
  return async (offset: number): Promise<ZyvopPost[]> => {
    const body = await fetchJson<JsonRpcResponse>(ZYVOP_MCP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        id: offset,
        method: TOOLS_CALL_METHOD,
        params: {
          name: LIST_POSTS_TOOL,
          arguments: {
            status: PUBLISHED_STATUS,
            limit: POSTS_PAGE_SIZE,
            offset,
          },
        },
      }),
      fetchImpl,
      vendorLabel: VENDOR_LABEL,
      deadline,
    });
    return parsePosts(toolResultText(body));
  };
}
