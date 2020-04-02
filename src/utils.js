import moment from "moment";

export function handleMessage(message, level = "info") {
  console.log(`[Biscoint BOT] [${moment().format()}] [${level}] - ${message}`);
}

export function handleError(message, error, throwError = false) {
  console.error(
    `[Biscoint BOT] [${moment().format()}] [error] - ${message}`,
    error
  );
  if (throwError) {
    throw new Error(error);
  }
}

export function percent(value1, value2) {
  return (Number(value2) / Number(value1) - 1) * 100;
}