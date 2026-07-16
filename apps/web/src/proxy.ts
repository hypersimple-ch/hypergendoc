import { NextResponse, type NextRequest } from "next/server";

const protectedPath = (pathname: string) =>
  pathname === "/workspace" || pathname.startsWith("/workspace/");
const hasSession = (request: NextRequest) =>
  request.cookies
    .getAll()
    .some(
      ({ name, value }) =>
        Boolean(value) &&
        (name.includes("better-auth") || name.includes("session")),
    );

/** Next 16 proxy: an early UX redirect only; the API remains authoritative. */
export function proxy(request: NextRequest) {
  if (protectedPath(request.nextUrl.pathname) && !hasSession(request)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/workspace/:path*"] };
