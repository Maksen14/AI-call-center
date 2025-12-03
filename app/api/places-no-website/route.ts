import { NextRequest, NextResponse } from "next/server";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

type ScanRequestBody = {
  city: string;
  pageToken?: string; // for pagination
};

type TextSearchPlace = {
  displayName?: { text?: string };
  websiteUri?: string;
  nationalPhoneNumber?: string;
};

type TextSearchResponse = {
  places?: TextSearchPlace[];
  nextPageToken?: string;
};

// Treat Facebook/Instagram URLs as "no real website"
function isSocialUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const patterns = ["facebook.com", "fb.com", "instagram.com", "instagr.am"];
  return patterns.some((p) => lower.includes(p));
}

export async function POST(req: NextRequest) {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      return NextResponse.json(
        { error: "Server not configured with GOOGLE_MAPS_API_KEY" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ScanRequestBody;
    const city = body.city?.trim();
    const pageToken = body.pageToken?.trim();

    if (!city) {
      return NextResponse.json(
        { error: "Parameter 'city' is required" },
        { status: 400 }
      );
    }

    const searchUrl = "https://places.googleapis.com/v1/places:searchText";

    const textQuery = `restaurants in ${city}`;
    // Same textQuery must be sent for paging
    let requestBody: Record<string, unknown> = { textQuery };
    if (pageToken) {
      requestBody = {
        ...requestBody,
        pageToken,
      };
    }

    const textSearchRes = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        // MUST include nextPageToken in field mask if you want it back
        // and the place fields you care about.
        "X-Goog-FieldMask":
          "places.displayName,places.websiteUri,places.nationalPhoneNumber,nextPageToken",
      },
      body: JSON.stringify(requestBody),
    });

    if (!textSearchRes.ok) {
      const text = await textSearchRes.text();
      return NextResponse.json(
        { error: "Text Search request failed", details: text },
        { status: textSearchRes.status }
      );
    }

    const data = (await textSearchRes.json()) as TextSearchResponse;
    const allPlaces = data.places ?? [];
    const nextPageToken = data.nextPageToken ?? null;

    const places = allPlaces.map((p) => {
      const website: string | undefined = p.websiteUri;
      let websiteCategory: "none" | "social" | "real" = "none";

      if (website) {
        if (isSocialUrl(website)) {
          websiteCategory = "social";
        } else {
          websiteCategory = "real";
        }
      }

      return {
        name: p.displayName?.text ?? "",
        phoneNumber: p.nationalPhoneNumber ?? null,
        websiteUri: website ?? null,
        websiteCategory,
      };
    });

    const categoryOrder: Record<"none" | "social" | "real", number> = {
      none: 0,
      social: 1,
      real: 2,
    };

    places.sort((a, b) => {
      const diff =
        categoryOrder[a.websiteCategory] - categoryOrder[b.websiteCategory];
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });

    const stats = {
      withoutWebsiteCount: places.filter((p) => p.websiteCategory === "none")
        .length,
      socialOnlyCount: places.filter((p) => p.websiteCategory === "social")
        .length,
      realWebsiteCount: places.filter((p) => p.websiteCategory === "real")
        .length,
    };

    return NextResponse.json({
      city,
      textQuery,
      nextPageToken,
      totalFoundThisPage: places.length,
      ...stats,
      places,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error in /api/places-no-website:", err);
    return NextResponse.json(
      { error: "Unexpected server error", details: message },
      { status: 500 }
    );
  }
}
