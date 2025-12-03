import { NextRequest, NextResponse } from "next/server";
import { fetchNotionEvents } from "@/lib/notionEvents";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const pageSize = Number(searchParams.get("pageSize")) || 25;
    const startCursor = searchParams.get("startCursor");

    const result = await fetchNotionEvents({
      pageSize,
      startCursor,
    });

    return NextResponse.json({
      events: result.events,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Notion events error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

