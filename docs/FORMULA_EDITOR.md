# Formula Editor

Admins can write and preview custom expressions evaluated against recent InfluxDB rows.

- Open the dashboard and go to `Config Editor`.
- The editor supports helper functions: `avg(...)`, `sum(...)`, `iff(cond, a, b)`.
- Use field names from your Influx measurement (for example: `JPM_RTD1_Puerta_Izq_C`, `JVA_RTD1_C`).
- Example expression: `avg(JPM_RTD1_Puerta_Izq_C, JVA_RTD1_C)`

## Preview API

- Endpoint: `POST /api/config/preview`
- Body: `{ "expression": string, "start": string?, "end": string?, "limit": number? }`

Example curl:

```
curl -X POST http://localhost:3000/api/config/preview \
  -H "Content-Type: application/json" \
  -d '{"expression":"avg(JPM_RTD1_Puerta_Izq_C, JVA_RTD1_C)", "limit": 20}'
```

The API validates syntax and returns an array of `{ timestamp, value }`.
