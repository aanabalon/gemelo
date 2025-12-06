import { InfluxDB } from '@influxdata/influxdb-client';

import fs from 'fs';
import path from 'path';

export function getInfluxConfig() {
    const configPath = path.join(process.cwd(), 'config', 'influx-config.json');
    let config = {
        url: process.env.INFLUX_URL || 'http://localhost:8086',
        token: process.env.INFLUX_TOKEN || '',
        org: process.env.INFLUX_ORG || '',
        bucket: process.env.INFLUX_BUCKET || 'data_gemelo',
    };

    if (fs.existsSync(configPath)) {
        try {
            const fileContent = fs.readFileSync(configPath, 'utf-8');
            const jsonConfig = JSON.parse(fileContent);
            config = { ...config, ...jsonConfig };
            console.log(`[Influx] Loaded config from ${configPath}`);
        } catch (error) {
            console.error(`[Influx] Failed to load config from ${configPath}`, error);
        }
    } else {
        console.log(`[Influx] Config file not found at ${configPath}, using environment variables.`);
    }

    return config;
}

let queryApi: any = null;

function getQueryApiInstance() {
    if (queryApi) return queryApi;

    const { url, token, org, bucket } = getInfluxConfig();
    console.log(`[Influx] Connecting to ${url}, org=${org}, bucket=${bucket}`);

    const client = new InfluxDB({ url, token });
    queryApi = client.getQueryApi(org);
    return queryApi;
}

const FIELD_FILTER = `
        r["_field"] == "JPM_RTD1_Puerta_Izq_C" or
        r["_field"] == "JPM_RTD2_Serpentin_Izq_C" or
        r["_field"] == "JPM_RTD3_Serpentin_Der_C" or
        r["_field"] == "JPM_RTD4_Hacia_Puerta_Lado_Gemelo_C" or
        r["_field"] == "JVA_RTD1_C" or
        r["_field"] == "JVA_RTD2_C" or
        r["_field"] == "JVA_RTD3_C" or
        r["_field"] == "JVA_RTD4_C" or
        r["_field"] == "anemometro1_mA" or
        r["_field"] == "anemometro1_ms" or
        r["_field"] == "anemometro2_grados" or
        r["_field"] == "anemometro2_mA" or
        r["_field"] == "corriente_A" or
        r["_field"] == "corriente_mA" or
        r["_field"] == "min" or
        r["_field"] == "Anemometro_m_s" or
        r["_field"] == "Promedio_Serpentin_C"
`;

export interface InfluxDataPoint {
    _time: string;
    _field: string;
    _value: number;
}

export interface MappedDataPoint {
    timestamp: Date;
    min_real?: number;
    [key: string]: number | Date | undefined;
}

/**
 * Fetches raw data from InfluxDB for a given time range.
 * Pivots fields to columns for easier processing.
 */
export async function fetchRawData(start: Date, end: Date): Promise<MappedDataPoint[]> {
    // InfluxFlux query to get data, filter by measurement and fields, and pivot
    console.info(`[Influx] fetch range: ${start.toISOString()} → ${end.toISOString()}`);
    const fluxQuery = `
    from(bucket: "${getInfluxConfig().bucket}")
      |> range(start: ${start.toISOString()}, stop: ${end.toISOString()})
      |> filter(fn: (r) => r["_measurement"] == "mediciones_plc")
      |> filter(fn: (r) => 
        ${FIELD_FILTER}
      )
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;

    const rows: MappedDataPoint[] = [];

    return new Promise((resolve, reject) => {
        getQueryApiInstance().queryRows(fluxQuery, {
            next(row: any, tableMeta: any) {
                const o = tableMeta.toObject(row);
                // Convert _time to Date object
                const timestamp = new Date(o._time);

                // Clean up object: remove internal influx fields if needed, or just keep them
                // We map the rest of the fields dynamically
                const point: MappedDataPoint = { timestamp };

                for (const key of Object.keys(o)) {
                    if (!['_start', '_stop', '_time', 'result', 'table', '_measurement'].includes(key)) {
                        point[key] = o[key];
                    }
                }
                rows.push(point);
            },
            error(error: any) {
                console.error('InfluxDB query error:', error);
                reject(error);
            },
            complete() {
                annotateWithRealMinuteIntervals(rows);
                resolve(rows);
            },
        });
    });
}

function annotateWithRealMinuteIntervals(points: MappedDataPoint[]) {
    if (!points.length) return;

    points.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let previousTimestamp: number | null = null;

    for (const point of points) {
        const currentTimestamp = point.timestamp.getTime();
        const deltaMs =
            previousTimestamp === null ? 0 : Math.max(currentTimestamp - previousTimestamp, 0);
        const deltaMinutes = deltaMs / 60000;
        point.min_real = Number.isFinite(deltaMinutes) ? deltaMinutes : 0;
        previousTimestamp = currentTimestamp;
    }
}

export async function fetchEarliestRawTimestamp(): Promise<Date | null> {
    const fluxQuery = `
    from(bucket: "${getInfluxConfig().bucket}")
      |> range(start: 0)
      |> filter(fn: (r) => r["_measurement"] == "mediciones_plc")
      |> filter(fn: (r) => 
        ${FIELD_FILTER}
      )
      |> first()
      |> keep(columns: ["_time"])
  `;

    return new Promise((resolve, reject) => {
        let earliest: Date | null = null;
        getQueryApiInstance().queryRows(fluxQuery, {
            next(row: any, tableMeta: any) {
                if (earliest) return;
                const o = tableMeta.toObject(row);
                earliest = new Date(o._time);
            },
            error(error: any) {
                console.error('InfluxDB query error:', error);
                reject(error);
            },
            complete() {
                resolve(earliest);
            },
        });
    });
}
