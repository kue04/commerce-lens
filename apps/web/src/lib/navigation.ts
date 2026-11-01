export type Page = "overview" | "profile" | "workspace" | "history" | "metrics";

export function pageFromUrl(url: URL): Page {
  if (url.searchParams.has("run") || url.searchParams.has("report")) return "workspace";
  const page = url.searchParams.get("page");
  return page === "profile" || page === "workspace" || page === "history" || page === "metrics"
    ? page : "overview";
}
