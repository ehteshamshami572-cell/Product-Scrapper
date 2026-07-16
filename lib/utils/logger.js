export const LogLevel = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
};

export class Logger {
  static formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  static info(message) {}

  static warn(message) {
    console.warn(Logger.formatMessage(LogLevel.WARN, message));
  }

  static error(message) {
    console.error(Logger.formatMessage(LogLevel.ERROR, message));
  }
}
