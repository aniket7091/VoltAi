import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Monte_carlo.css';

/* =====================================================================
   Monte Carlo Risk Analysis & Uncertainty Simulation
   API Endpoint: /energy/risk
   ===================================================================== */

const DIRECT_API_URL = 'https://voltai-backend-w7bt.onrender.com/energy/risk';

const DEFAULT_RISK_PAYLOAD = {
    demand_mw: [
        1450, 1420, 1390, 1380, 1400, 1500,
        1650, 1750, 1800, 1850, 1900, 1950,
        1980, 2000, 1970, 1930, 1900, 1950,
        2000, 1980, 1900, 1800, 1650, 1520,
    ],
    use_forecast_24h: false,
    weather_forecasts: [
        { temperature: 24.0, humidity: 80.0, wind_speed: 8.0, solar_irradiance: 0.0 },
        { temperature: 23.5, humidity: 82.0, wind_speed: 7.5, solar_irradiance: 0.0 },
        { temperature: 23.0, humidity: 83.0, wind_speed: 7.0, solar_irradiance: 0.0 },
        { temperature: 22.5, humidity: 84.0, wind_speed: 6.5, solar_irradiance: 0.0 },
        { temperature: 22.5, humidity: 82.0, wind_speed: 7.0, solar_irradiance: 0.0 },
        { temperature: 23.0, humidity: 80.0, wind_speed: 8.0, solar_irradiance: 30.0 },
        { temperature: 24.0, humidity: 76.0, wind_speed: 9.0, solar_irradiance: 150.0 },
        { temperature: 25.5, humidity: 72.0, wind_speed: 10.0, solar_irradiance: 320.0 },
        { temperature: 27.0, humidity: 68.0, wind_speed: 11.0, solar_irradiance: 500.0 },
        { temperature: 28.5, humidity: 65.0, wind_speed: 12.0, solar_irradiance: 650.0 },
        { temperature: 30.0, humidity: 60.0, wind_speed: 13.0, solar_irradiance: 780.0 },
        { temperature: 31.0, humidity: 57.0, wind_speed: 14.0, solar_irradiance: 850.0 },
        { temperature: 32.0, humidity: 54.0, wind_speed: 15.0, solar_irradiance: 900.0 },
        { temperature: 33.0, humidity: 50.0, wind_speed: 15.0, solar_irradiance: 920.0 },
        { temperature: 33.5, humidity: 48.0, wind_speed: 14.0, solar_irradiance: 850.0 },
        { temperature: 33.0, humidity: 50.0, wind_speed: 13.0, solar_irradiance: 700.0 },
        { temperature: 32.0, humidity: 53.0, wind_speed: 12.0, solar_irradiance: 500.0 },
        { temperature: 30.5, humidity: 58.0, wind_speed: 11.0, solar_irradiance: 250.0 },
        { temperature: 29.0, humidity: 62.0, wind_speed: 10.0, solar_irradiance: 80.0 },
        { temperature: 28.0, humidity: 65.0, wind_speed: 9.0, solar_irradiance: 0.0 },
        { temperature: 27.0, humidity: 68.0, wind_speed: 8.5, solar_irradiance: 0.0 },
        { temperature: 26.0, humidity: 72.0, wind_speed: 8.0, solar_irradiance: 0.0 },
        { temperature: 25.0, humidity: 76.0, wind_speed: 7.5, solar_irradiance: 0.0 },
        { temperature: 24.5, humidity: 78.0, wind_speed: 7.0, solar_irradiance: 0.0 },
    ],
    calendar_overrides: [
        {
            is_weekend: 1,
            is_holiday: 0,
            is_festival: 0,
            is_pre_holiday: 0,
            is_post_holiday: 0,
            is_pre_festival: 0,
            is_post_festival: 0,
            workday_after_holiday: 0,
        },
    ],
    load_shedding_cost: 100,
    solar_profile: [
        0.0, 0.0, 0.0, 0.0, 0.0, 0.03,
        0.15, 0.32, 0.50, 0.65, 0.78, 0.85,
        0.90, 0.92, 0.85, 0.70, 0.50, 0.25,
        0.08, 0.0, 0.0, 0.0, 0.0, 0.0,
    ],
};

const DISPATCH_ENGINES = [
    { value: 'merit_order', label: 'merit_order (Merit Order)' },
    { value: 'pypsa', label: 'pypsa (PyPSA Linear OPF)' },
];

/* ---------- helpers ---------- */
const fmtNum = (n, d = 2) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtINR = (n) => `₹${fmtNum(n, 2)}`;
const fmtPct = (n, d = 2) => `${fmtNum(n, d)}%`;

/* Compact number for axis ticks (20k, 40k, 60k, …) */
const fmtAxis = (v) => {
    if (v === 0) return '0';
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(abs % 1e6 === 0 ? 0 : 1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(abs % 1e3 === 0 ? 0 : 1)}k`;
    return String(Math.round(v));
};

/* ---------- icons ---------- */
function Svg({ children, size = 16, ...rest }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...rest}
        >
            {children}
        </svg>
    );
}
const ChevronIcon = () => <Svg size={16} className="mc-chevron"><path d="m6 9 6 6 6-6" /></Svg>;
const InfoIcon = () => <Svg size={14}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></Svg>;
const CheckIcon = () => <Svg size={14}><path d="M20 6 9 17l-5-5" /></Svg>;
const MinusIcon = () => <Svg size={14}><path d="M5 12h14" /></Svg>;
const PlusIcon = () => <Svg size={14}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
const DiceIcon = () => (
    <Svg size={18}>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8" cy="8" r="1.2" fill="currentColor" />
        <circle cx="16" cy="8" r="1.2" fill="currentColor" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        <circle cx="8" cy="16" r="1.2" fill="currentColor" />
        <circle cx="16" cy="16" r="1.2" fill="currentColor" />
    </Svg>
);
const TableIcon = () => <Svg size={14}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M9 4v16" /></Svg>;

/* =====================================================================
   Quantile Legend
   ===================================================================== */
function QuantileLegend() {
    return (
        <div className="mc-legend">
            <div className="mc-legend-item">
                <span className="mc-legend-dot p05"></span>
                <span className="mc-legend-text">P05 (Left)</span>
            </div>
            <div className="mc-legend-item">
                <span className="mc-legend-dot median"></span>
                <span className="mc-legend-text">Median P50 (Centre)</span>
            </div>
            <div className="mc-legend-item">
                <span className="mc-legend-dot p95"></span>
                <span className="mc-legend-text">P95 (Right)</span>
            </div>
            <div className="mc-legend-item">
                <span className="mc-legend-line"></span>
                <span className="mc-legend-text">90% Range Span</span>
            </div>
        </div>
    );
}

/* =====================================================================
   Quantile Range Chart (P05 — Median — P95)
   ===================================================================== */
function QuantileRangeChart({ rows }) {
    const wrapRef = useRef(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [hoverRow, setHoverRow] = useState(null);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const update = () => {
            const w = Math.max(el.clientWidth, 580);
            const h = el.clientHeight || 340;
            setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const geo = useMemo(() => {
        const { w, h } = size;
        if (!w || !h || !rows || !rows.length) return null;

        const m = { top: 18, right: 26, bottom: 40, left: 180 };
        const iw = w - m.left - m.right;
        const ih = h - m.top - m.bottom;

        const maxVal = Math.max(1, ...rows.flatMap((r) => [r.p05, r.p50, r.p95]));
        const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
        const niceMax = Math.ceil(maxVal / magnitude) * magnitude;
        const range = niceMax || 1;

        const n = rows.length;
        const laneH = ih / n;
        const y = (i) => m.top + laneH * i + laneH / 2;
        const x = (v) => m.left + (Math.max(0, v) / range) * iw;

        const ticks = 6;
        const xticks = Array.from({ length: ticks + 1 }, (_, i) => (range * i) / ticks);

        return { m, iw, ih, laneH, x, y, xticks, n };
    }, [size, rows]);

    const hr = hoverRow !== null && rows && rows[hoverRow] ? rows[hoverRow] : null;

    return (
        <div className="mc-chart-wrap">
            <div className="mc-chart" ref={wrapRef} onPointerLeave={() => setHoverRow(null)}>
                {geo && (
                    <>
                        <svg width={size.w} height={size.h} role="img" aria-label="Empirical scenario quantile ranges">
                            {/* vertical grid lines */}
                            {geo.xticks.map((tv, i) => (
                                <g key={i}>
                                    <line
                                        className="mc-grid"
                                        x1={geo.x(tv)}
                                        x2={geo.x(tv)}
                                        y1={geo.m.top - 4}
                                        y2={geo.m.top + geo.ih + 4}
                                    />
                                    <text className="mc-axis-text" x={geo.x(tv)} y={geo.m.top + geo.ih + 20} textAnchor="middle">
                                        {fmtAxis(tv)}
                                    </text>
                                </g>
                            ))}

                            {/* lane rows */}
                            {rows.map((r, i) => {
                                const cy = geo.y(i);
                                const x0 = geo.x(r.p05);
                                const x1 = geo.x(r.p95);
                                const xm = geo.x(r.p50);
                                const isHov = hoverRow === i;
                                const isSpread = r.p95 > r.p05;

                                return (
                                    <g key={r.key} className={`mc-lane-group ${isHov ? 'active' : ''}`}>
                                        {/* lane hover highlight */}
                                        {isHov && (
                                            <rect
                                                className="mc-lane-hover"
                                                x={geo.m.left - 8}
                                                y={geo.m.top + geo.laneH * i + 1}
                                                width={geo.iw + 16}
                                                height={geo.laneH - 2}
                                                rx="4"
                                            />
                                        )}

                                        {/* lane separator */}
                                        <line
                                            className="mc-lane"
                                            x1={geo.m.left}
                                            x2={size.w - geo.m.right}
                                            y1={geo.m.top + geo.laneH * (i + 1)}
                                            y2={geo.m.top + geo.laneH * (i + 1)}
                                        />

                                        {/* label */}
                                        <text
                                            className={`mc-lane-label ${isHov ? 'active' : ''}`}
                                            x={geo.m.left - 12}
                                            y={cy + 4}
                                            textAnchor="end"
                                        >
                                            {r.label}
                                        </text>

                                        {/* range bar */}
                                        {isSpread && (
                                            <line className="mc-range" x1={x0} x2={x1} y1={cy} y2={cy} />
                                        )}

                                        {/* dots: p05 (left), median (center), p95 (right) */}
                                        {isSpread ? (
                                            <>
                                                <circle className="mc-dot p05" cx={x0} cy={cy} r="4" />
                                                <circle className="mc-dot p95" cx={x1} cy={cy} r="4" />
                                                <circle className="mc-dot median" cx={xm} cy={cy} r="5" />
                                            </>
                                        ) : (
                                            <circle className="mc-dot point" cx={xm} cy={cy} r="4.5" />
                                        )}

                                        {/* hover capture rect for the lane */}
                                        <rect
                                            x={0}
                                            y={geo.m.top + geo.laneH * i}
                                            width={size.w}
                                            height={geo.laneH}
                                            fill="transparent"
                                            style={{ cursor: 'pointer' }}
                                            onPointerEnter={() => setHoverRow(i)}
                                        />
                                    </g>
                                );
                            })}

                            {/* axis title */}
                            <text
                                className="mc-axis-title"
                                x={geo.m.left + geo.iw / 2}
                                y={size.h - 4}
                                textAnchor="middle"
                            >
                                Metric Value (Empirical Quantiles P05 — Median P50 — P95)
                            </text>
                        </svg>

                        {/* Interactive Tooltip */}
                        {hr && (
                            <div
                                className={`mc-tip ${geo.x(hr.p50) > size.w * 0.62 ? 'flip' : ''}`}
                                style={{
                                    left: `${Math.min(size.w - 180, Math.max(geo.m.left + 20, geo.x(hr.p50)))}px`,
                                    top: `${geo.y(hoverRow)}px`,
                                }}
                            >
                                <div className="mc-tip-head">
                                    <strong>{hr.label}</strong>
                                </div>
                                <div className="mc-tip-body">
                                    <div className="mc-tip-row">
                                        <span className="mc-tip-dot p05"></span>
                                        <span className="mc-tip-name">P05 (Left):</span>
                                        <span className="mc-tip-val">
                                            {hr.unit === '₹' ? fmtINR(hr.p05) : `${fmtNum(hr.p05, 2)} ${hr.unit}`}
                                        </span>
                                    </div>
                                    <div className="mc-tip-row">
                                        <span className="mc-tip-dot median"></span>
                                        <span className="mc-tip-name">Median (Centre):</span>
                                        <span className="mc-tip-val">
                                            {hr.unit === '₹' ? fmtINR(hr.p50) : `${fmtNum(hr.p50, 2)} ${hr.unit}`}
                                        </span>
                                    </div>
                                    <div className="mc-tip-row">
                                        <span className="mc-tip-dot p95"></span>
                                        <span className="mc-tip-name">P95 (Right):</span>
                                        <span className="mc-tip-val">
                                            {hr.unit === '₹' ? fmtINR(hr.p95) : `${fmtNum(hr.p95, 2)} ${hr.unit}`}
                                        </span>
                                    </div>
                                    {hr.p95 > hr.p05 && (
                                        <div className="mc-tip-range">
                                            <span>90% Range Spread:</span>
                                            <strong>
                                                {hr.unit === '₹' ? fmtINR(hr.p95 - hr.p05) : `${fmtNum(hr.p95 - hr.p05, 2)} ${hr.unit}`}
                                            </strong>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/* =====================================================================
   Main Monte Carlo Risk Analysis Component
   ===================================================================== */
function Monte_carlo({ onRunSimulation }) {
    /* ----- 1. Interactive input parameters requested by user ----- */
    const [nSimulations, setNSimulations] = useState(100);
    const [engine, setEngine] = useState('merit_order');
    const [clipTail, setClipTail] = useState(true);
    const [seed, setSeed] = useState(42);

    /* ----- results state ----- */
    const [kpis, setKpis] = useState(null);
    const [quantiles, setQuantiles] = useState(null);
    const [baseForecast, setBaseForecast] = useState(null);
    const [provenanceNote, setProvenanceNote] = useState(null);
    const [message, setMessage] = useState(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState(null);
    const [tableOpen, setTableOpen] = useState(true);

    /* ----- execute API call ----- */
    const handleRun = async () => {
        setError(null);
        setMessage(null);
        setRunning(true);
        try {
            const requestPayload = {
                ...DEFAULT_RISK_PAYLOAD,
                n_simulations: Number(nSimulations) || 100,
                random_seed: Number(seed) >= 0 ? Number(seed) : 42,
                dispatch_engine: engine,
                enable_residual_clipping: Boolean(clipTail),
            };

            let data;
            if (onRunSimulation) {
                data = await onRunSimulation(requestPayload);
            } else {
                let response;

                // 1. Try local dev server proxy first (/energy/risk) only in local development
                const isLocal =
                    typeof window !== 'undefined' &&
                    (window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.startsWith('192.168.') ||
                     window.location.hostname.startsWith('10.') ||
                     window.location.hostname.startsWith('172.'));

                if (isLocal) {
                    try {
                        const proxyRes = await fetch('/energy/risk', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(requestPayload),
                        });
                        const ct = proxyRes.headers.get('content-type') || '';
                        if (proxyRes.ok && ct.includes('application/json')) {
                            response = proxyRes;
                        }
                    } catch {
                        /* fallback to direct API */
                    }
                }

                // 2. Direct API call if in production or proxy is not available
                if (!response) {
                    response = await fetch(DIRECT_API_URL, {
                        method: 'POST',
                        headers: {
                            'accept': '*/*',
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(requestPayload),
                    });
                }

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API request failed (${response.status}): ${errText || response.statusText}`);
                }

                data = await response.json();
            }

            // Map risk metrics
            const rm = data.risk_metrics || {};
            const lolpVal = Number(rm.LOLP ?? 0);
            const resSuff = Number(rm.reserve_sufficiency ?? 1);

            const mappedKpis = {
                lolp: lolpVal <= 1 && lolpVal > 0 ? lolpVal * 100 : lolpVal,
                eens: Number(rm.EENS_mwh ?? 0),
                reserveSufficiency: resSuff <= 1 ? resSuff * 100 : resSuff,
                expectedCostMean: Number(rm.mean_cost ?? 0),
                bestCaseMin: Number(rm.min_cost ?? 0),
                medianP50: Number(rm.median_cost ?? 0),
                p95Worst: Number(rm.p95_cost ?? 0),
                peakDemandP95: Number(rm.peak_demand_p95_mw ?? 0),
            };

            // Map quantile summaries
            const mappedQuantiles = (data.quantile_summaries || []).map((row, idx) => {
                const metric = row.metric || `Metric ${idx + 1}`;
                let unit = '';
                if (metric.includes('₹')) unit = '₹';
                else if (metric.includes('MWh')) unit = 'MWh';
                else if (metric.includes('MW')) unit = 'MW';

                return {
                    key: `q_${idx}_${metric.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                    label: metric,
                    p05: Number(row.p05 ?? 0),
                    p50: Number(row.p50 ?? 0),
                    p95: Number(row.p95 ?? 0),
                    unit,
                };
            });

            setKpis(mappedKpis);
            setQuantiles(mappedQuantiles);
            setBaseForecast(data.base_forecast_summary || null);
            setProvenanceNote(data.uncertainty_provenance_note || null);
            setMessage(
                `Evaluated ${data.n_simulations ?? nSimulations} Monte Carlo scenarios with '${data.dispatch_engine ?? engine}' solver (Seed: ${data.random_seed ?? seed}) successfully!`
            );
            setTableOpen(true);
        } catch (err) {
            const isCorsError =
                err?.name === 'TypeError' &&
                (err?.message === 'Load failed' ||
                    err?.message?.includes('Failed to fetch') ||
                    err?.message?.includes('NetworkError'));

            if (isCorsError) {
                setError(
                    'CORS / Network Error: Could not connect to the backend service. Please check your network connection or CORS settings on the Render backend.'
                );
            } else {
                setError((err && err.message) || 'Risk simulation failed. Please try again.');
            }
        } finally {
            setRunning(false);
        }
    };

    /* seed stepper helpers */
    const bumpSeed = (dir) => setSeed((v) => Math.max(0, (Number(v) || 0) + dir));

    const onSeedChange = (v) => {
        if (v === '') {
            setSeed('');
            return;
        }
        const n = Number(v);
        if (!Number.isNaN(n) && n >= 0) setSeed(Math.floor(n));
    };

    /* simulations slider helper */
    const onSliderChange = (e) => setNSimulations(Number(e.target.value));

    const onSimsDirectChange = (v) => {
        if (v === '') {
            setNSimulations('');
            return;
        }
        const n = Number(v);
        if (!Number.isNaN(n) && n >= 1) setNSimulations(Math.floor(n));
    };

    return (
        <div className="mc">
            {/* ============ CONFIG GRID ============ */}
            <section className="mc-config" aria-label="Monte Carlo configuration parameters">
                {/* -- Left column: 1. Number of Simulations & 4. Reproducibility Seed -- */}
                <div className="mc-col">
                    {/* 1. Number of Simulations */}
                    <div className="mc-field">
                        <div className="mc-field-head">
                            <label className="mc-field-label" htmlFor="mc-sims">1. Number of Simulations</label>
                            <div className="mc-sims-val-box">
                                <input
                                    id="mc-sims-input"
                                    type="number"
                                    min="1"
                                    max="2000"
                                    step="10"
                                    className="mc-sims-input"
                                    value={nSimulations}
                                    onChange={(e) => onSimsDirectChange(e.target.value)}
                                    onBlur={() => {
                                        if (!nSimulations || Number(nSimulations) < 1) setNSimulations(100);
                                    }}
                                    aria-label="Direct input for number of simulations"
                                />
                                <span className="mc-sims-unit">draws</span>
                            </div>
                        </div>
                        <input
                            id="mc-sims"
                            className="mc-slider"
                            type="range"
                            min="10"
                            max="1000"
                            step="10"
                            value={Math.min(1000, Math.max(10, Number(nSimulations) || 100))}
                            onChange={onSliderChange}
                            style={{
                                '--pct': `${((Math.min(1000, Math.max(10, Number(nSimulations) || 100)) - 10) / (1000 - 10)) * 100}%`,
                            }}
                            aria-valuemin="10"
                            aria-valuemax="1000"
                            aria-valuenow={Number(nSimulations) || 100}
                        />
                    </div>

                    {/* 4. Reproducibility Seed */}
                    <div className="mc-field">
                        <div className="mc-field-head">
                            <label className="mc-field-label" htmlFor="mc-seed">4. Reproducibility Seed</label>
                            <span className="mc-hint" title="Fixes pseudorandom draw sequence for deterministic replication.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-stepper">
                            <button
                                type="button"
                                className="mc-step-btn"
                                onClick={() => bumpSeed(-1)}
                                aria-label="Decrease seed"
                            >
                                <MinusIcon />
                            </button>
                            <input
                                id="mc-seed"
                                className="mc-step-input"
                                type="number"
                                step="1"
                                min="0"
                                value={seed}
                                onChange={(e) => onSeedChange(e.target.value)}
                                onBlur={(e) => onSeedChange(e.target.value === '' ? 42 : e.target.value)}
                            />
                            <button
                                type="button"
                                className="mc-step-btn"
                                onClick={() => bumpSeed(1)}
                                aria-label="Increase seed"
                            >
                                <PlusIcon />
                            </button>
                        </div>
                    </div>
                </div>

                {/* -- Right column: 2. Dispatch Engine & 3. Enable Residual Tail Clipping -- */}
                <div className="mc-col">
                    {/* 2. Dispatch Engine Dropdown */}
                    <div className="mc-field">
                        <div className="mc-field-head">
                            <label className="mc-field-label" htmlFor="mc-engine">2. Dispatch Engine</label>
                            <span className="mc-hint" title="Select between Merit Order dispatch or PyPSA Linear OPF solver.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-select-wrap">
                            <select
                                id="mc-engine"
                                className="mc-select"
                                value={engine}
                                onChange={(e) => setEngine(e.target.value)}
                            >
                                {DISPATCH_ENGINES.map((eng) => (
                                    <option key={eng.value} value={eng.value}>{eng.label}</option>
                                ))}
                            </select>
                            <ChevronIcon />
                        </div>
                    </div>

                    {/* 3. Enable Residual Tail Clipping (P05–P95) */}
                    <div className="mc-field" style={{ justifyContent: 'center' }}>
                        <div className="mc-field-head" style={{ marginBottom: 4 }}>
                            <span className="mc-field-label">3. Residual Bounds</span>
                        </div>
                        <label className="mc-check">
                            <input
                                type="checkbox"
                                checked={clipTail}
                                onChange={(e) => setClipTail(e.target.checked)}
                            />
                            <span className="mc-check-box" />
                            <span className="mc-check-text">Enable Residual Tail Clipping (P05–P95)</span>
                        </label>
                    </div>
                </div>
            </section>

            {/* ============ RUN BUTTON ============ */}
            <div className="mc-actions">
                <button
                    type="button"
                    className="mc-btn primary"
                    onClick={handleRun}
                    disabled={running}
                >
                    {running ? (
                        <>
                            <span className="mc-spinner" aria-hidden="true" />
                            <span>Running Simulation…</span>
                        </>
                    ) : (
                        <>
                            <DiceIcon />
                            <span>Run Monte Carlo Risk Simulation</span>
                        </>
                    )}
                </button>
                {error && <span className="mc-msg error">{error}</span>}
            </div>

            {/* ============ SUCCESS BANNER ============ */}
            {message && (
                <div className="mc-banner">
                    <span className="mc-banner-icon"><CheckIcon /></span>
                    <span>{message}</span>
                </div>
            )}

            {/* ============ BASE FORECAST SUMMARY ============ */}
            {baseForecast && (
                <div className="mc-base-summary" aria-label="Base forecast overview">
                    <span className="mc-base-title">Base Forecast:</span>
                    <div className="mc-base-items">
                        <div className="mc-base-item">
                            <span>Peak Demand:</span>
                            <strong>{fmtNum(baseForecast.peak_demand_mw, 1)} MW</strong>
                        </div>
                        <div className="mc-base-item">
                            <span>Mean Demand:</span>
                            <strong>{fmtNum(baseForecast.mean_demand_mw, 2)} MW</strong>
                        </div>
                        <div className="mc-base-item">
                            <span>Total Demand:</span>
                            <strong>{fmtNum(baseForecast.total_demand_mwh, 1)} MWh</strong>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ KPI GRID ============ */}
            {kpis && (
                <section className="mc-kpis" aria-label="Monte Carlo risk metrics">
                    <div className="mc-kpi primary">
                        <div className="mc-kpi-label">
                            Loss of Load Probability (LOLP)
                            <span className="mc-hint" title="Probability that available system generation capacity fails to cover demand.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-kpi-value">{fmtPct(kpis.lolp, 2)}</div>
                    </div>

                    <div className="mc-kpi">
                        <div className="mc-kpi-label">
                            Expected Unserved Energy (EENS)
                            <span className="mc-hint" title="Expected magnitude of unserved energy across all evaluated trajectories.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-kpi-value">
                            {fmtNum(kpis.eens, 2)} <span className="mc-kpi-unit">MWh</span>
                        </div>
                    </div>

                    <div className="mc-kpi">
                        <div className="mc-kpi-label">
                            Reserve Sufficiency
                            <span className="mc-hint" title="Fraction of simulated scenarios where operating reserves met criteria.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-kpi-value">{fmtPct(kpis.reserveSufficiency, 2)}</div>
                    </div>

                    <div className="mc-kpi">
                        <div className="mc-kpi-label">
                            Expected Cost (Mean)
                            <span className="mc-hint" title="Average economic dispatch cost across all simulated runs.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-kpi-value">{fmtINR(kpis.expectedCostMean)}</div>
                    </div>

                    <div className="mc-kpi">
                        <div className="mc-kpi-label">
                            Best-Case Cost (Min)
                            <span className="mc-hint" title="Minimum dispatch cost recorded across all scenarios.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-kpi-value">{fmtINR(kpis.bestCaseMin)}</div>
                    </div>

                    <div className="mc-kpi">
                        <div className="mc-kpi-label">
                            Median Cost (P50)
                            <span className="mc-hint" title="50th percentile median expected dispatch cost.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-kpi-value">{fmtINR(kpis.medianP50)}</div>
                    </div>

                    <div className="mc-kpi">
                        <div className="mc-kpi-label">
                            P95 Worst-Case Cost
                            <span className="mc-hint" title="95th percentile risk ceiling for generation dispatch expenses.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-kpi-value">{fmtINR(kpis.p95Worst)}</div>
                    </div>

                    <div className="mc-kpi">
                        <div className="mc-kpi-label">
                            Peak Demand P95
                            <span className="mc-hint" title="95th percentile maximum coincident hourly peak demand.">
                                <InfoIcon />
                            </span>
                        </div>
                        <div className="mc-kpi-value">
                            {fmtNum(kpis.peakDemandP95, 1)} <span className="mc-kpi-unit">MW</span>
                        </div>
                    </div>
                </section>
            )}

            {/* ============ QUANTILE CHART ============ */}
            {quantiles && (
                <section className="mc-card mc-chart-card">
                    <div className="mc-chart-head">
                        <div>
                            <h2 className="mc-card-title">Empirical Scenario Quantile Ranges</h2>
                            <p className="mc-card-sub">P05 (5th Percentile) — Median P50 — P95 (95th Percentile Bounds)</p>
                        </div>
                        <QuantileLegend />
                    </div>
                    <QuantileRangeChart rows={quantiles} />
                </section>
            )}

            {/* ============ DETAILED TABLE (collapsible) ============ */}
            {quantiles && (
                <section className={`mc-card mc-table-card ${tableOpen ? 'open' : ''}`}>
                    <button
                        type="button"
                        className="mc-table-trigger"
                        aria-expanded={tableOpen}
                        onClick={() => setTableOpen((o) => !o)}
                    >
                        <span className="mc-table-trigger-icon"><TableIcon /></span>
                        <span className="mc-table-trigger-text">Detailed Empirical Quantiles Table</span>
                        <ChevronIcon />
                    </button>

                    <div className={`mc-collapse ${tableOpen ? 'open' : ''}`}>
                        <div className="mc-collapse-inner">
                            <div className="mc-table-wrap">
                                <table className="mc-table">
                                    <thead>
                                        <tr>
                                            <th>Metric</th>
                                            <th className="num">P05 (5th %)</th>
                                            <th className="num">Median (P50)</th>
                                            <th className="num">P95 (95th %)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {quantiles.map((r) => (
                                            <tr key={r.key}>
                                                <td style={{ fontWeight: 600 }}>{r.label}</td>
                                                <td className="num">
                                                    {r.unit === '₹' ? fmtINR(r.p05) : fmtNum(r.p05, 2)}
                                                </td>
                                                <td className="num">
                                                    {r.unit === '₹' ? fmtINR(r.p50) : fmtNum(r.p50, 2)}
                                                </td>
                                                <td className="num">
                                                    {r.unit === '₹' ? fmtINR(r.p95) : fmtNum(r.p95, 2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* ============ INTERPRETATION NOTE ============ */}
            {quantiles && (
                <aside className="mc-note">
                    <span className="mc-note-icon"><InfoIcon /></span>
                    <p>
                        <strong>Interpretation Note: </strong>
                        {provenanceNote || (
                            <>
                                Probabilistic risk metrics evaluated via residual bootstrapping from the stacked out-of-fold
                                ensemble. Tail clipping applied between 5th and 95th empirical percentiles. Reported quantiles
                                represent empirical scenario bounds across simulated trajectories and must not be interpreted as
                                statistically calibrated prediction intervals.
                            </>
                        )}
                    </p>
                </aside>
            )}

            {/* ============ INITIAL EMPTY STATE ============ */}
            {!kpis && !running && (
                <section className="mc-empty">
                    <div className="mc-empty-icon">
                        <DiceIcon />
                    </div>
                    <h3 className="mc-empty-title">Monte Carlo Risk Analysis Ready</h3>
                    <p className="mc-empty-hint">
                        Configure the parameters above (Number of Simulations, Dispatch Engine, Tail Clipping, and Random Seed)
                        and click <strong>Run Monte Carlo Risk Simulation</strong> to compute probabilistic reserve adequacy,
                        loss-of-load probability, and dispatch cost quantiles.
                    </p>
                </section>
            )}
        </div>
    );
}

export default Monte_carlo;