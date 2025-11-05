// src/logger.js
import winston from "winston";
import { config } from "./config.js";

const { combine, timestamp, printf, colorize } = winston.format;
const cliFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}] ${message}`;
  })
);

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  transports: [
    new winston.transports.Console({
      format: cliFormat
    })
  ],
  exitOnError: false
});
