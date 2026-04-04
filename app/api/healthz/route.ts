import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
  });
}
