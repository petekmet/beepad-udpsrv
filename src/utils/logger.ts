import { env } from "process";
import { randomUUID } from "crypto";
import { createLogger, format, transports, Logger } from "winston";
import LokiTransport from "winston-loki";

// --- Correlation model -----------------------------------------------------
// Loki LABELS are indexed and define the stream, so they MUST stay low
// cardinality. We only ever label:
//   app   – static ("beepad-udpsrv"), set on the transport
//   event – a small fixed set (see LogEvent)
//   level – added automatically by winston-loki
// Everything high-cardinality (device address, deviceId, trace id, srcIp…)
// travels as JSON FIELDS on the log line and is filtered at query time. That
// keeps stream cardinality bounded while still allowing correlation, e.g.
//   {app="beepad-udpsrv", event="notification"}                 – all notifications
//   {app="beepad-udpsrv"} | json | device="<addr>"              – one device
//   {app="beepad-udpsrv"} | json | trace="<id>"                 – one datagram, end to end
// ---------------------------------------------------------------------------

export type LogEvent =
    | "server"       // socket lifecycle + raw datagram in/out
    | "uplink"       // device identification + packet decode
    | "cmac"         // CMAC verification
    | "measurement"  // persisting a measurement
    | "notification"; // battery / weight-alarm notifications

export interface LogFields {
    trace?: string;       // per-datagram correlation id (see newTrace)
    device?: string;      // NB-IoT composed address once known
    deviceName?: string;
    deviceId?: number;
    srcIp?: string;
    [key: string]: unknown;
}

/**
 * Build the winston meta for a log call: promotes `event` to a low-cardinality
 * Loki LABEL and carries the rest as high-cardinality JSON fields. Use this
 * everywhere instead of hand-writing `{ labels: { … } }` — that was error prone
 * (the old code had a silent `labelse` typo and also promoted device address,
 * which is high cardinality, to a label).
 */
export function evt(event: LogEvent, fields: LogFields = {}) {
    return { labels: { event }, ...fields };
}

/** Short correlation id shared by every log line from one inbound datagram. */
export function newTrace(): string {
    return randomUUID().slice(0, 8);
}

// Base pipeline: timestamp + printf-style %s interpolation. Transport-specific
// formats below decide the final shape (readable console vs JSON for Loki).
const baseFormat = format.combine(format.timestamp(), format.splat());

const logger: Logger = createLogger({
    level: "debug",
    format: baseFormat,
    transports: [
        new transports.Console({
            format: format.printf((info: any) => {
                const { level, message, timestamp, labels, ...rest } = info;
                const ev = labels?.event ? ` [${labels.event}]` : "";
                const extra = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
                return `${timestamp} ${level}${ev}: ${message}${extra}`;
            }),
        }),
    ],
});

// Only ship to Loki when configured. Keeps local/dev and tests console-only
// instead of crashing on an undefined LOKI_URL.
if (env.LOKI_URL) {
    logger.add(new LokiTransport({
        host: env.LOKI_URL,
        labels: { app: "beepad-udpsrv" },
        // JSON line so LogQL `| json` can filter on device/trace/etc.
        format: format.json(),
        replaceTimestamp: true,
    }));
}

export default logger;
