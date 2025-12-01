# Gemelo 2 — Extended README

Repository for the Gemelo 2 project.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Formula Editor

Admins can write and preview custom expressions evaluated against recent InfluxDB rows.

- Open the dashboard and go to `Config Editor`.
- The editor supports helper functions: `avg(...)`, `sum(...)`, `iff(cond, a, b)`.
- Use field names from your Influx measurement (for example: `JPM_RTD1_Puerta_Izq_C`, `JVA_RTD1_C`).
- Example expression: `avg(JPM_RTD1_Puerta_Izq_C, JVA_RTD1_C)`

### Preview API

- Endpoint: `POST /api/config/preview`
- Body: `{ "expression": string, "start": string?, "end": string?, "limit": number? }`

Example curl:

```
curl -X POST http://localhost:3000/api/config/preview \
  -H "Content-Type: application/json" \
  -d '{"expression":"avg(JPM_RTD1_Puerta_Izq_C, JVA_RTD1_C)", "limit": 20}'
```

The API validates syntax and returns an array of `{ timestamp, value }`.

## Notes for developers

- The server preview endpoint uses a restricted mathjs instance (`src/lib/formulas.ts`) and helper functions (`avg`, `sum`, `iff`).
- Client UI is in `src/app/(dashboard)/config-editor/FormulaEditorClient.tsx` and posts to the preview API.
- If you encounter dev-server HMR issues, try clearing `.next` and restarting: `rm -rf .next && npm run dev`.

## TimescaleDB for EnergyDerivedValue

- Run `npx prisma migrate deploy` (or `prisma migrate dev`) to execute `prisma/migrations/20251201090000_enable_timescaledb/migration.sql`, which enables the TimescaleDB extension and turns `"EnergyDerivedValue"` into a hypertable on `timestamp`.
- Apply the optional optimizations with `psql "$DATABASE_URL" -f prisma/timescale/energy_derived_value_policies.sql` (compression/retention) and `psql "$DATABASE_URL" -f prisma/timescale/energy_accum_1h_continuous_aggregate.sql` (continuous aggregate + refresh policy).
- Prisma's `EnergyDerivedValue` model works unchanged on TimescaleDB, so `prisma.energyDerivedValue.create/findMany/groupBy` and `prisma.$queryRaw` continue to operate as plain PostgreSQL queries.
