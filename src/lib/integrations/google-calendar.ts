import { google } from "googleapis";
import { db } from "@/lib/db";

async function getGoogleAuth(userId: string) {
  const integration = await db.integration.findUnique({
    where: {
      userId_provider: { userId, provider: "GOOGLE_CALENDAR" },
    },
  });

  if (!integration?.accessToken) {
    throw new Error("Google Calendar not connected — sign in with Google");
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken ?? undefined,
  });

  oauth2.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.integration.update({
        where: {
          userId_provider: { userId, provider: "GOOGLE_CALENDAR" },
        },
        data: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? undefined,
          expiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : undefined,
        },
      });
    }
  });

  return oauth2;
}

export async function createCalendarEvent(
  userId: string,
  event: {
    title: string;
    description?: string;
    start?: string;
    end?: string;
    attendees?: string[];
  }
) {
  const auth = await getGoogleAuth(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const start = event.start ? new Date(event.start) : new Date(Date.now() + 86400000);
  const end = event.end
    ? new Date(event.end)
    : new Date(start.getTime() + 3600000);

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.title,
      description: event.description,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: event.attendees?.map((email) => ({ email })),
      status: "tentative",
    },
  });

  return {
    id: response.data.id,
    htmlLink: response.data.htmlLink,
    summary: response.data.summary,
  };
}

export async function deleteCalendarEvent(userId: string, eventId: string) {
  const auth = await getGoogleAuth(userId);
  const calendar = google.calendar({ version: "v3", auth });

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });
}

export async function isGoogleConnected(userId: string) {
  const integration = await db.integration.findUnique({
    where: {
      userId_provider: { userId, provider: "GOOGLE_CALENDAR" },
    },
  });
  return !!integration?.accessToken;
}
