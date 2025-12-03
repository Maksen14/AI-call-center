import { Client } from "@notionhq/client";
import type {
  PageObjectResponse,
  QueryDatabaseResponse,
} from "@notionhq/client/build/src/api-endpoints";

export type NotionEvent = {
  id: string;
  title: string;
  start: string;
  end?: string | null;
  location?: string | null;
  url?: string | null;
};

type NotionEnv = {
  apiKey: string;
  databaseId: string;
  dateProperty: string;
  titleProperty: string;
  locationProperty: string;
};

export type FetchNotionEventsOptions = {
  pageSize?: number;
  startCursor?: string | null;
};

export type FetchNotionEventsResult = {
  events: NotionEvent[];
  hasMore: boolean;
  nextCursor: string | null;
};

function ensureEnv(): NotionEnv {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_CALENDAR_DATABASE_ID;
  if (!apiKey || !databaseId) {
    throw new Error("NOTION_API_KEY and NOTION_CALENDAR_DATABASE_ID must be set");
  }
  const dateProperty = process.env.NOTION_CALENDAR_DATE_PROPERTY ?? "Date";
  const titleProperty = process.env.NOTION_CALENDAR_TITLE_PROPERTY ?? "Name";
  const locationProperty = process.env.NOTION_CALENDAR_LOCATION_PROPERTY ?? "Location";
  return { apiKey, databaseId, dateProperty, titleProperty, locationProperty };
}

function extractTitle(
  properties: PageObjectResponse["properties"],
  propertyName: string,
): string {
  const prop = properties[propertyName];
  const titlePropCandidate =
    prop && prop.type === "title"
      ? prop
      : (Object.values(properties).find((candidate) => candidate?.type === "title") as
          | PageObjectResponse["properties"][string]
          | undefined);
  if (!titlePropCandidate || titlePropCandidate.type !== "title") {
    return "Untitled event";
  }
  const titleProp = titlePropCandidate;
  const text =
    titleProp.title
      ?.map((fragment) => fragment.plain_text)
      .filter(Boolean)
      .join(" ")
      .trim() ?? "";
  return text || "Untitled event";
}

function extractDate(
  properties: PageObjectResponse["properties"],
  propertyName: string,
): { start: string | null; end: string | null } {
  const prop = properties[propertyName];
  const datePropCandidate =
    prop && prop.type === "date"
      ? prop
      : (Object.values(properties).find((candidate) => candidate?.type === "date") as
          | PageObjectResponse["properties"][string]
          | undefined);
  if (!datePropCandidate || datePropCandidate.type !== "date") {
    return { start: null, end: null };
  }
  const dateProp = datePropCandidate;
  return {
    start: dateProp.date?.start ?? null,
    end: dateProp.date?.end ?? null,
  };
}

function extractLocation(
  properties: PageObjectResponse["properties"],
  propertyName: string,
): string | null {
  const candidate = properties[propertyName] ?? properties.Location ?? properties.location;
  if (!candidate || candidate.type !== "rich_text") {
    return null;
  }

  const text =
    candidate.rich_text
      ?.map((fragment) => fragment.plain_text)
      .filter(Boolean)
      .join(" ")
      .trim() ?? "";
  return text || null;
}

export async function fetchNotionEvents(
  options?: FetchNotionEventsOptions,
): Promise<FetchNotionEventsResult> {
  const env = ensureEnv();
  const client = new Client({ auth: env.apiKey });

  const pageSize = Math.min(Math.max(options?.pageSize ?? 25, 1), 100);
  const response: QueryDatabaseResponse = await client.databases.query({
    database_id: env.databaseId,
    sorts: [
      {
        property: env.dateProperty,
        direction: "ascending",
      },
    ],
    page_size: pageSize,
    start_cursor: options?.startCursor ?? undefined,
  });

  const events: NotionEvent[] = response.results
    .filter((page): page is PageObjectResponse => page.object === "page" && "properties" in page)
    .map((page) => {
      const { id, url, properties } = page;
      const { start, end } = extractDate(properties, env.dateProperty);
      if (!start) return null;
      return {
        id,
        title: extractTitle(properties, env.titleProperty),
        start,
        end,
        location: extractLocation(properties, env.locationProperty),
        url,
      };
    })
    .filter(Boolean) as NotionEvent[];

  return {
    events,
    hasMore: response.has_more,
    nextCursor: response.next_cursor,
  };
}


