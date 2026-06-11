import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "df_session";

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

async function readSession(req) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = ["/login", "/register"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const session = await readSession(req);

  if (PUBLIC_PATHS.includes(pathname)) {
    if (session) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Superadmin-only section (platform tenant management).
  if (pathname.startsWith("/dashboard/tenants") && session.role !== "superadmin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // User-only feature sections (superadmin tak punya tenant).
  const userOnly = ["/dashboard/delete", "/dashboard/add", "/dashboard/seller", "/dashboard/settings", "/dashboard/profile"];
  if (session.role === "superadmin" && userOnly.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/register", "/dashboard/:path*"],
};
