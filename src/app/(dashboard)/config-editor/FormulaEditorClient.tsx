"use client";

import React, { useState } from 'react';

export default function FormulaEditorClient() {
  const [expression, setExpression] = useState('avg(JPM_RTD1_Puerta_Izq_C, JVA_RTD1_C)');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Array<{ timestamp: string; value: number | null }>>([]);

  async function onPreview(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setValues([]);
    try {
      const res = await fetch('/api/config/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression, start: start || undefined, end: end || undefined, limit }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Preview failed');
      } else {
        setValues(data.values || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onPreview} className="space-y-2">
        <label className="block text-sm font-medium">Expression</label>
        <textarea
          className="w-full border rounded p-2"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          rows={4}
        />

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium">Start (ISO)</label>
            <input className="w-full border rounded p-2" value={start} onChange={(e) => setStart(e.target.value)} placeholder="2025-11-27T00:00:00Z" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium">End (ISO)</label>
            <input className="w-full border rounded p-2" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="now" />
          </div>
          <div style={{ width: 120 }}>
            <label className="block text-sm font-medium">Limit</label>
            <input type="number" className="w-full border rounded p-2" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded" disabled={loading}>
            {loading ? 'Running...' : 'Preview'}
          </button>
          <button type="button" className="px-4 py-2 border rounded" onClick={() => { setExpression(''); setValues([]); setError(null); }}>
            Clear
          </button>
        </div>
      </form>

      {error && <div className="text-red-600">{error}</div>}

      <div>
        <h3 className="text-lg font-medium">Results ({values.length})</h3>
        <div className="overflow-auto max-h-96 border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Timestamp</th>
                <th className="p-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {values.map((v, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="p-2 align-top text-xs">{new Date(v.timestamp).toISOString()}</td>
                  <td className="p-2 text-right font-mono">{v.value === null ? 'null' : String(v.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
