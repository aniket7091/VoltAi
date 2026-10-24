/**
 * forecastService.js
 *
 * Reusable API service for the 24-hour forecast workflow:
 *   - Fetch weather (OpenWeatherMap), solar radiation (Open-Meteo), festivals (Tathaastu)
 *   - Interpolate 3-hourly OWM data → 24 hourly values in Asia/Kolkata
 *   - Build calendar_overrides from festival data + weekday
 *   - Frame, validate, and submit the /forecast/24h payload
 */

const OWM_API_KEY =
    process.env.REACT_APP_OWM_API_KEY || '9ac3c7904d87791550e6b425a0215f8e';
const VOLTAI_API_URL =
    process.env.REACT_APP_VOLTAI_API_URL || 'https://voltai-backend-w7bt.onrender.com';

const OPEN_METEO_LAT = '12.9762';
const OPEN_METEO_LON = '77.6033';
const FESTIVAL_API_URL = 'https://tathaastuapi.com/demo/festivals';

/** IST is UTC +05:30 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/* ================================================================
   Date helpers
   ================================================================ */

/** Shift a YYYY-MM-DD string by ±N days and return YYYY-MM-DD. */
function offsetDateStr(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00Z'); // noon UTC avoids edge-day issues
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}

/** JS day-of-week (0 = Sun, 6 = Sat) for a YYYY-MM-DD string. */
function getDayOfWeek(dateStr) {
    return new Date(dateStr + 'T12:00:00Z').getUTCDay();
}

/* ================================================================
   API fetch functions
   ================================================================ */

/**
 * Fetch 5-day / 3-hour weather forecast from OpenWeatherMap (metric units).
 * Returns the raw JSON response with `list[]` of 40 entries.
 */
export async function fetchWeatherForecast() {
    if (!OWM_API_KEY) {
        throw new Error(
            'OpenWeatherMap API key not configured. Set REACT_APP_OWM_API_KEY in your .env file.'
        );
    }
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=Bangalore,in&units=metric&APPID=${OWM_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Weather API error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
}

/**
 * Fetch hourly shortwave radiation from Open-Meteo for a specific YYYY-MM-DD date.
 * Returns 24 hourly values in Asia/Kolkata timezone.
 */
export async function fetchSolarRadiation(dateStr) {
    const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${OPEN_METEO_LAT}&longitude=${OPEN_METEO_LON}` +
        `&hourly=shortwave_radiation` +
        `&start_date=${dateStr}&end_date=${dateStr}` +
        `&timezone=Asia%2FKolkata`;
    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Solar Radiation API error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
}

/**
 * Fetch festival / holiday info from Tathaastu for a single YYYY-MM-DD.
 */
export async function fetchFestivalData(dateStr) {
    const url = `${FESTIVAL_API_URL}?date=${dateStr}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Festival API error ${res.status}`);
    return res.json();
}

/**
 * Fetch festival data for the target date AND its neighbours (prev / next day)
 * so we can derive is_pre_festival, is_post_festival, etc.
 *
 * Uses Promise.allSettled so that partial failures (e.g. CORS) don't
 * break the entire flow.
 */
export async function fetchFestivalsWithNeighbors(dateStr) {
    const prevStr = offsetDateStr(dateStr, -1);
    const nextStr = offsetDateStr(dateStr, +1);

    const [targetRes, prevRes, nextRes] = await Promise.allSettled([
        fetchFestivalData(dateStr),
        fetchFestivalData(prevStr),
        fetchFestivalData(nextStr),
    ]);

    return {
        target: targetRes.status === 'fulfilled' ? targetRes.value : null,
        prev: prevRes.status === 'fulfilled' ? prevRes.value : null,
        next: nextRes.status === 'fulfilled' ? nextRes.value : null,
    };
}

/* ================================================================
   Data transformation
   ================================================================ */

/**
 * Linearly interpolate OpenWeatherMap 3-hourly data to 24 hourly values
 * aligned to IST hours (00:00–23:00) for a given YYYY-MM-DD date.
 *
 * OWM `dt` is a UTC unix timestamp (seconds).  Each IST hour h corresponds
 * to  UTC = Date.UTC(Y, M-1, D, h) − IST_OFFSET_MS.
 */
export function interpolateWeatherHourly(owmList, targetDateStr) {
    const [y, m, d] = targetDateStr.split('-').map(Number);
    const istMidnightUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MS;

    const sorted = [...owmList].sort((a, b) => a.dt - b.dt);
    const hourly = [];

    for (let h = 0; h < 24; h++) {
        const targetSec = (istMidnightUtcMs + h * 3600000) / 1000;

        let lo = null;
        let hi = null;
        for (const entry of sorted) {
            if (entry.dt <= targetSec) lo = entry;
            if (entry.dt >= targetSec && hi === null) hi = entry;
        }

        let temperature, humidity, wind_speed;

        if (lo && hi && lo.dt !== hi.dt) {
            const t = (targetSec - lo.dt) / (hi.dt - lo.dt);
            temperature = +(lo.main.temp + t * (hi.main.temp - lo.main.temp)).toFixed(2);
            humidity = Math.round(lo.main.humidity + t * (hi.main.humidity - lo.main.humidity));
            wind_speed = +(lo.wind.speed + t * (hi.wind.speed - lo.wind.speed)).toFixed(2);
        } else if (lo || hi) {
            const src = lo || hi;
            temperature = src.main.temp;
            humidity = src.main.humidity;
            wind_speed = src.wind.speed;
        } else {
            hourly.push(null); // no data for this hour
            continue;
        }

        hourly.push({ hour: h, temperature, humidity, wind_speed });
    }

    return hourly;
}

/* ---------- Festival / holiday helpers ---------- */

function hasFestival(data) {
    return data && data.count > 0;
}

function hasHoliday(data) {
    if (!data || !data.festivals) return false;
    return data.festivals.some((f) => f.priority_tier === 'MAJOR' || f.priority >= 90);
}

/**
 * Build 24 identical calendar_overrides objects from festival data + weekday.
 * All 24 hours of a single day share the same calendar flags.
 *
 * @param {string} dateStr       YYYY-MM-DD (the forecast date)
 * @param {object} festivalBundle { target, prev, next } — each is the raw
 *                                 festival API response or null.
 */
export function buildCalendarOverrides(dateStr, festivalBundle) {
    const dow = getDayOfWeek(dateStr);
    const isWeekend = dow === 0 || dow === 6 ? 1 : 0;

    const target = festivalBundle?.target;
    const prev = festivalBundle?.prev;
    const next = festivalBundle?.next;

    const isFestival = hasFestival(target) ? 1 : 0;
    const isHoliday = hasHoliday(target) ? 1 : 0;

    // "pre" means *today is the day before* → look at the NEXT day
    const isPreFestival = hasFestival(next) ? 1 : 0;
    const isPostFestival = hasFestival(prev) ? 1 : 0;
    const isPreHoliday = hasHoliday(next) ? 1 : 0;
    const isPostHoliday = hasHoliday(prev) ? 1 : 0;

    // workday_after_holiday: today is a weekday AND previous day was holiday/weekend
    const prevDow = getDayOfWeek(offsetDateStr(dateStr, -1));
    const prevIsWeekend = prevDow === 0 || prevDow === 6;
    const workdayAfterHoliday = !isWeekend && (isPostHoliday || prevIsWeekend) ? 1 : 0;

    const obj = {
        is_weekend: isWeekend,
        is_holiday: isHoliday,
        is_festival: isFestival,
        is_pre_holiday: isPreHoliday,
        is_post_holiday: isPostHoliday,
        is_pre_festival: isPreFestival,
        is_post_festival: isPostFestival,
        workday_after_holiday: workdayAfterHoliday,
    };

    return Array.from({ length: 24 }, () => ({ ...obj }));
}

/* ================================================================
   Payload framing & validation
   ================================================================ */

/**
 * Build the /forecast/24h JSON payload from weather rows and calendar overrides.
 *
 * @param {Array<{temp,humidity,wind,solar}>} weatherRows  24 row objects
 * @param {Array<Object>} calendarOverrides  24 calendar flag objects
 */
export function buildForecastPayload(weatherRows, calendarOverrides) {
    const weather_forecasts = weatherRows.map((r) => ({
        temperature: Number(r.temp) || 0,
        humidity: Number(r.humidity) || 0,
        wind_speed: Number(r.wind) || 0,
        solar_irradiance: Number(r.solar) || 0,
    }));

    return { weather_forecasts, calendar_overrides: calendarOverrides };
}

/**
 * Validate the framed payload before submission.
 * Returns { valid: boolean, errors: string[] }.
 */
export function validatePayload(payload) {
    const errors = [];

    if (!payload.weather_forecasts || payload.weather_forecasts.length !== 24) {
        errors.push(
            `weather_forecasts must have exactly 24 entries, got ${payload.weather_forecasts?.length ?? 0}`
        );
    }
    if (!payload.calendar_overrides || payload.calendar_overrides.length !== 24) {
        errors.push(
            `calendar_overrides must have exactly 24 entries, got ${payload.calendar_overrides?.length ?? 0}`
        );
    }

    const REQUIRED_WEATHER_FIELDS = ['temperature', 'humidity', 'wind_speed', 'solar_irradiance'];
    payload.weather_forecasts?.forEach((wf, i) => {
        for (const field of REQUIRED_WEATHER_FIELDS) {
            if (wf[field] == null || typeof wf[field] !== 'number' || Number.isNaN(wf[field])) {
                errors.push(`weather_forecasts[${i}].${field} is invalid (${wf[field]})`);
            }
        }
    });

    const REQUIRED_CAL_FIELDS = [
        'is_weekend', 'is_holiday', 'is_festival',
        'is_pre_holiday', 'is_post_holiday',
        'is_pre_festival', 'is_post_festival',
        'workday_after_holiday',
    ];
    payload.calendar_overrides?.forEach((co, i) => {
        for (const field of REQUIRED_CAL_FIELDS) {
            if (co[field] == null) {
                errors.push(`calendar_overrides[${i}] missing field: ${field}`);
            }
        }
    });

    return { valid: errors.length === 0, errors };
}

/* ================================================================
   Submit prediction
   ================================================================ */

/**
 * POST the framed payload to the VoltAI /forecast/24h endpoint.
 * Tries the CRA dev-server proxy first, then falls back to the direct URL.
 */
export async function submitForecast(payload) {
    let response;

    // 1. Try dev-server proxy first only in local development
    const isLocal =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' ||
         window.location.hostname === '127.0.0.1' ||
         window.location.hostname.startsWith('192.168.') ||
         window.location.hostname.startsWith('10.') ||
         window.location.hostname.startsWith('172.'));

    if (isLocal) {
        try {
            const proxyRes = await fetch('/forecast/24h', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const ct = proxyRes.headers.get('content-type') || '';
            if (proxyRes.ok && ct.includes('application/json')) {
                response = proxyRes;
            }
        } catch {
            /* proxy unavailable — fall through */
        }
    }

    // 2. Direct API call if in production or proxy is not available
    if (!response) {
        response = await fetch(`${VOLTAI_API_URL}/forecast/24h`, {
            method: 'POST',
            headers: { accept: '*/*', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(
            `Prediction API error ${response.status}: ${errText || response.statusText}`
        );
    }

    return response.json();
}
