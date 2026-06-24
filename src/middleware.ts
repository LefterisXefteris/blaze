import { updateSession } from "@/lib/auth/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|blaze-logo.png|blaze-logo.svg|icon.png|icon.svg).*)",
  ],
};
