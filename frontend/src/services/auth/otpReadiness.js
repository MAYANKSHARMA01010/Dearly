import { ApiError } from "../../api/client.js";
/** @param {number} milliseconds @param {AbortSignal} signal */
const pause = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", cancel);
      resolve(undefined);
    };
    const timer = setTimeout(finish, milliseconds);
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(new ApiError("Connection check canceled.", "aborted"));
    };
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
/** Poll only read-only status. Never submit or replay an OTP from this loop.
 * @param {{request:(path:string,options?:RequestInit)=>Promise<unknown>}} client
 * @param {AbortSignal|undefined} signal
 * @param {{timeoutMs?:number,pause?:typeof pause}} [options]
 */
export async function waitForOtpReady(client, signal, options = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 240000);
  try {
    for (;;) {
      if (controller.signal.aborted)
        throw new ApiError("Connection check canceled.", "aborted");
      const result = /** @type {{status?:unknown}} */ (
        await client.request("/auth/otp/status", { signal: controller.signal })
      );
      if (result?.status === "READY") return;
      if (result?.status === "UNAVAILABLE")
        throw new ApiError(
          "WhatsApp verification is unavailable. No code was requested. Please try again later.",
          "http",
          503,
        );
      if (result?.status !== "WARMING")
        throw new ApiError(
          "The verification service returned an unexpected response. No code was requested.",
          "invalid_response",
        );
      await (options.pause ?? pause)(5000, controller.signal);
    }
  } catch (error) {
    if (timedOut)
      throw new ApiError(
        "WhatsApp verification is still connecting. No code was requested. Try again shortly.",
        "http",
        503,
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
