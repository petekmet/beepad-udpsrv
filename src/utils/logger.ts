import { env } from "process";
import { createLogger, format, transports } from "winston";
import LokiTransport from "winston-loki";

const formatValue = format.combine(
    format.splat(),
    format.printf((info) => `[${info.level}]: ${info.message}`)
);
const logger = createLogger({
    level: "debug", // Default log level
    format: formatValue,
    transports: [
        new transports.Console(), // Log to console
        new LokiTransport({
            host: env.LOKI_URL!,
            labels: { app: "beepad-udpsrv" },
            format: formatValue,
            replaceTimestamp: true
        })
    ]
});

export default logger;