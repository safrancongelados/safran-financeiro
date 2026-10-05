import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verificarToken } from "@/lib/auth";

/**
 * Tudo é privado, menos o login e as rotas que a Vercel (cron) e a Pluggy
 * (webhook) chamam — essas se protegem com segredo próprio.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const autenticado = token ? await verificarToken(token) : false;

  if (pathname === "/login") {
    return autenticado ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!autenticado) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("de", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/cron|api/webhooks|_next/static|_next/image|favicon.ico).*)"],
};
