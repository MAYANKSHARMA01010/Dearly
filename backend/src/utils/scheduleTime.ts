import { Temporal } from '@js-temporal/polyfill';
import { ApiError } from './ApiError';
export function resolveScheduleTime(
  localDateTime: string,
  timezone: string,
  now: Date,
) {
  try {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime) ||
      !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timezone)
    )
      throw new RangeError();
    const zone = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
    }).resolvedOptions().timeZone;
    const local = Temporal.PlainDateTime.from(localDateTime, {
      overflow: 'reject',
    });
    const earlier = local.toZonedDateTime(zone, { disambiguation: 'earlier' });
    const later = local.toZonedDateTime(zone, { disambiguation: 'later' });
    if (
      !earlier.toPlainDateTime().equals(local) ||
      !later.toPlainDateTime().equals(local)
    )
      throw new ApiError(
        400,
        'NONEXISTENT_TIME',
        'This local time does not exist. Choose another time.',
      );
    if (earlier.epochMilliseconds !== later.epochMilliseconds)
      throw new ApiError(
        400,
        'AMBIGUOUS_TIME',
        'This local time occurs twice. Choose an unambiguous time.',
      );
    const instant = earlier.epochMilliseconds;
    if (instant < now.getTime() + 60000)
      throw new ApiError(
        400,
        'SCHEDULE_TOO_SOON',
        'Choose a time at least one minute in the future.',
      );
    if (instant > now.getTime() + 3660 * 86400000)
      throw new ApiError(
        400,
        'SCHEDULE_TOO_FAR',
        'Choose a time within the next ten years.',
      );
    return {
      scheduledFor: new Date(instant).toISOString(),
      timezone: zone,
      localDateTime,
      offset: earlier.offset,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      400,
      'INVALID_SCHEDULE_TIME',
      'Enter a valid calendar date, time and IANA timezone.',
    );
  }
}
