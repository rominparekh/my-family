import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Routes that require a logged-in user (UI). API routes guard themselves.
const PROTECTED_PREFIXES = ["/dashboard", "/friends", "/approvals", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/friends/:path*", "/approvals/:path*", "/settings/:path*"],
};
