import { NextResponse } from 'next/server';
import { fetchRawData } from '@/lib/influx';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!start || !end) {
        return NextResponse.json({ error: 'Missing start or end params' }, { status: 400 });
    }

    try {
        const data = await fetchRawData(new Date(start), new Date(end));
        // Limit data points for performance if needed, or aggregate
        // For now return raw, but frontend might struggle with too many points.
        // In a real app, we'd downsample here.
        return NextResponse.json(data);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
