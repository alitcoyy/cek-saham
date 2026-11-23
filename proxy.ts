import { NextResponse, type NextRequest } from 'next/server';

/**
 * Kunci sederhana untuk versi online: kalau APP_PASSWORD diisi (di Vercel), browser meminta kata sandi
 * sekali lalu mengingatnya. Nama pengguna bebas. Tanpa APP_PASSWORD (lokal) tidak dikunci.
 */
export function proxy(req: NextRequest) {
  const pass = process.env.APP_PASSWORD;
  if (!pass) return NextResponse.next();
  const [scheme, value] = (req.headers.get('authorization') ?? '').split(' ');
  if (scheme === 'Basic' && value) {
    const decoded = atob(value);
    if (decoded.slice(decoded.indexOf(':') + 1) === pass) return NextResponse.next();
  }
  return new NextResponse('Butuh kata sandi.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Cek Saham", charset="UTF-8"' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
