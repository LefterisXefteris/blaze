import { NextResponse, type NextRequest } from "next/server";
import { clearAllAuthCookies } from "@/lib/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  clearAllAuthCookies(response, request);
  return response;
}

export async function GET(request: NextRequest) {
  return POST(request);
}
