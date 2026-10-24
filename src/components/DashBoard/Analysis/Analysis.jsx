import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Analysis.css';

/* =====================================================================
   Scenarios catalog — mirrors your backend scenario keys.
   key must match what your XGBoost stress-test endpoint expects.
   ===================================================================== */
const SCENARIOS = [
    { key: 'Normal', label: 'Normal', desc: 'Baseline operational feature vector without modification.' },
    { key: 'Night Peak (22:00)', label: 'Night Peak (22:00)', desc: 'Fourier hour harmonics adjusted to 22:00 (hour_sin = sin(2π·22/24), hour_cos = cos(2π·22/24)).' },
    { key: 'Heatwave (+5°C)', label: 'Heatwave (+5°C)', desc: 'Temperature increased by 5°C with updated temp_x_hour_sin interaction.' },
    { key: 'Festival Load', label: 'Festival Load', desc: 'is_festival flag set to 1.' },
    { key: 'Rainy Day', label: 'Rainy Day', desc: 'Humidity increased by 20% and solar_irradiance attenuated by 70% (multiplied by 0.3).' },
];

const DEFAULT_BASELINE = {
    temperatureC: 28.5,
    humidityPct: 65.0,
    priorLag1Mw: 125.5,
};

const STATIC_FEATURES = {
    is_weekend: 1,
    is_holiday: 0,
    is_festival: 0,
    is_pre_holiday: 0,
    is_post_holiday: 0,
    is_pre_festival: 0,
    is_post_festival: 0,
    workday_after_holiday: 0,
    temperature: 28.5,
    humidity: 65.0,
    wind_speed: 12.0,
    solar_irradiance: 650.0,
    lag_1: 125.5,
    lag_24: 118.2,
    lag_48: 121.7,
    lag_72: 115.4,
    lag_168: 120.1,
    rolling_mean_24: 122.3,
    rolling_std_24: 8.6,
    rolling_max_24: 140.5,
    rolling_min_24: 105.2,
    hour_sin: 0.866025,
    hour_cos: -0.5,
    day_sin: 0.974928,
    day_cos: -0.222521,
    month_sin: 0.5,
    month_cos: 0.866025,
    temp_x_hour_sin: 24.681713,
};

const DIRECT_API_URL = 'https://voltai-backend-w7bt.onrender.com/predict/scenario';

/* ---------- small icons (kept consistent with System Overview) ---------- */
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
const ChevronIcon = () => <Svg size={16} className="an-chevron"><path d="m6 9 6 6 6-6" /></Svg>;
const XIcon = () => <Svg size={12}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>;
const CheckIcon = () => <Svg size={14}><path d="M20 6 9 17l-5-5" /></Svg>;
const BoltIcon = () => <Svg size={15}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></Svg>;
const PlusIcon = () => <Svg size={14}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;
const MinusIcon = () => <Svg size={14}><path d="M5 12h14" /></Svg>;

/* ---------- helpers ---------- */
const fmtNum = (n, d = 2) =>
    Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtSigned = (n, d = 1) => `${n > 0 ? '+' : ''}${fmtNum(n, d)}`;
const fmtPct = (n, d = 2) => `${n > 0 ? '+' : ''}${fmtNum(n, d)}%`;

/* Multi-select dropdown for "Scenarios to Evaluate" */
function ScenarioMultiSelect({ options, value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const toggle = (key) => {
        if (value.includes(key)) onChange(value.filter((k) => k !== key));
        else onChange([...value, key]);
    };

    const removeChip = (key) => onChange(value.filter((k) => k !== key));

    const selectedLabels = value
        .map((k) => options.find((o) => o.key === k)?.label)
        .filter(Boolean);

    return (
        <div className="an-multiselect" ref={ref}>
            <button
                type="button"
                className={`an-ms-trigger ${open ? 'open' : ''}`}
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="an-ms-values">
                    {selectedLabels.length === 0 && <span className="an-ms-placeholder">Select scenarios…</span>}
                    {selectedLabels.map((label) => (
                        <span key={label} className="an-chip">
                            {label}
                            <span
                                role="button"
                                tabIndex={0}
                                className="an-chip-x"
                                aria-label={`Remove ${label}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const k = options.find((o) => o.label === label)?.key;
                                    if (k) removeChip(k);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const k = options.find((o) => o.label === label)?.key;
                                        if (k) removeChip(k);
                                    }
                                }}
                            >
                                <XIcon />
                            </span>
                        </span>
                    ))}
                </span>
                <ChevronIcon />
            </button>

            {open && (
                <ul className="an-ms-menu" role="listbox" aria-multiselectable="true">
                    {options.map((opt) => {
                        const checked = value.includes(opt.key);
                        return (
                            <li
                                key={opt.key}
                                role="option"
                                aria-selected={checked}
                                className={`an-ms-option ${checked ? 'checked' : ''}`}
                                onClick={() => toggle(opt.key)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggle(opt.key);
                                    }
                                }}
                                tabIndex={0}
                            >
                                <span className={`an-ms-box ${checked ? 'on' : ''}`}>
                                    {checked && <CheckIcon />}
                                </span>
                                <span className="an-ms-label">{opt.label}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

/* Small numeric stepper input */
function NumberStepper({ label, value, step = 0.1, min, max, onChange, digits = 2 }) {
    const clamp = (v) => {
        let n = Number(v);
        if (Number.isNaN(n)) n = 0;
        if (min != null) n = Math.max(min, n);
        if (max != null) n = Math.min(max, n);
        return Math.round(n * 10 ** digits) / 10 ** digits;
    };
    const bump = (dir) => onChange(clamp(Number(value) + dir * step));

    return (
        <div className="an-field">
            <label className="an-field-label">{label}</label>
            <div className="an-stepper">
                <button type="button" className="an-step-btn" onClick={() => bump(-1)} aria-label={`Decrease ${label}`}>
                    <MinusIcon />
                </button>
                <input
                    className="an-step-input"
                    type="number"
                    step={step}
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={(e) => onChange(clamp(e.target.value))}
                    aria-label={label}
                />
                <button type="button" className="an-step-btn" onClick={() => bump(1)} aria-label={`Increase ${label}`}>
                    <PlusIcon />
                </button>
            </div>
        </div>
    );
}

/* Bar chart (plain SVG) — Scenario Stress Testing Forecast Comparison */
function ScenarioBarChart({ rows, baselineMw }) {
    const wrapRef = useRef(null);
    const [size, setSize] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const update = () => {
            const w = el.clientWidth;
            const h = el.clientHeight;
            setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const isMobile = size.w < 520;

    const geo = useMemo(() => {
        const { w, h } = size;
        if (!w || !h || !rows.length) return null;
        const leftMargin = w < 520 ? 64 : 72;
        const m = {
            top: w < 520 ? 24 : 34,
            right: 18,
            bottom: w < 520 ? 82 : 46,
            left: leftMargin,
        };
        const iw = w - m.left - m.right;
        const ih = h - m.top - m.bottom;

        const maxVal = Math.max(baselineMw, ...rows.map((r) => r.predictedMw));
        // pad top so the labels have room
        const top = Math.ceil((maxVal * 1.08) / 100) * 100;
        const bottom = 0;
        const range = top - bottom || 1;

        const n = rows.length;
        const slot = iw / n;
        const barW = Math.min(64, slot * (w < 520 ? 0.62 : 0.55));

        const x = (i) => m.left + slot * i + slot / 2;
        const y = (v) => m.top + ih - ((v - bottom) / range) * ih;
        const base = m.top + ih;

        const ticks = 5;
        const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round(bottom + (range * i) / ticks));

        return { m, iw, ih, x, y, base, barW, top, bottom, yTicks, n };
    }, [size, rows, baselineMw]);

    return (
        <div className="an-chart" ref={wrapRef}>
            {geo && (
                <svg width={size.w} height={size.h} role="img" aria-label="Scenario stress testing forecast comparison bar chart">
                    {geo.yTicks.map((tv) => (
                        <g key={tv}>
                            <line className="an-grid" x1={geo.m.left} x2={size.w - geo.m.right} y1={geo.y(tv)} y2={geo.y(tv)} />
                            <text className="an-axis-text" x={geo.m.left - 8} y={geo.y(tv) + 3} textAnchor="end">
                                {tv}
                            </text>
                        </g>
                    ))}

                    {/* baseline dashed reference line */}
                    {baselineMw > 0 && (
                        <line
                            className="an-baseline"
                            x1={geo.m.left}
                            x2={size.w - geo.m.right}
                            y1={geo.y(baselineMw)}
                            y2={geo.y(baselineMw)}
                        />
                    )}

                    {rows.map((r, i) => {
                        const bx = geo.x(i) - geo.barW / 2;
                        const by = geo.y(r.predictedMw);
                        const bh = geo.base - by;
                        return (
                            <g key={r.key}>
                                <rect className="an-bar" x={bx} y={by} width={geo.barW} height={bh} rx="2" />
                                {isMobile ? (
                                    <text
                                        className="an-bar-value-overlay"
                                        transform={`translate(${geo.x(i)}, ${by + 48}) rotate(-90)`}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                    >
                                        {fmtNum(r.predictedMw, 1)} MW
                                    </text>
                                ) : (
                                    <text
                                        className="an-bar-value"
                                        x={geo.x(i)}
                                        y={by - 6}
                                        textAnchor="middle"
                                    >
                                        {fmtNum(r.predictedMw, 1)} MW
                                    </text>
                                )}
                                {isMobile ? (
                                    <text
                                        className="an-axis-text"
                                        transform={`translate(${geo.x(i)}, ${geo.base + 12}) rotate(-35)`}
                                        textAnchor="end"
                                    >
                                        {r.label}
                                    </text>
                                ) : (
                                    <text
                                        className="an-axis-text"
                                        x={geo.x(i)}
                                        y={geo.base + 18}
                                        textAnchor="middle"
                                    >
                                        {r.label}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    <text
                        className="an-axis-title"
                        transform={`translate(${isMobile ? 12 : 14} ${geo.m.top + geo.ih / 2}) rotate(-90)`}
                        textAnchor="middle"
                    >
                        Predicted Demand (MW)
                    </text>
                    <text className="an-axis-title" x={geo.m.left + geo.iw / 2} y={size.h - 4} textAnchor="middle">
                        Scenario
                    </text>
                </svg>
            )}
        </div>
    );
}

/* Main component */
function Analysis({ onRunStressTest }) {
    const [baseline, setBaseline] = useState(DEFAULT_BASELINE);
    const [selected, setSelected] = useState(SCENARIOS.map((s) => s.key));
    const [rows, setRows] = useState(null);
    const [baselineMw, setBaselineMw] = useState(0);
    const [modelUsed, setModelUsed] = useState(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState(null);

    /* ---------- run stress test (live API integration) ---------- */
    const runStressTest = async () => {
        if (!selected || selected.length === 0) {
            setError('Please select at least one scenario to evaluate.');
            return;
        }

        setError(null);
        setRunning(true);
        try {
            const tempVal = Number(baseline.temperatureC) || 0;
            const humVal = Number(baseline.humidityPct) || 0;
            const lagVal = Number(baseline.priorLag1Mw) || 0;

            const requestPayload = {
                features: {
                    ...STATIC_FEATURES,
                    temperature: tempVal,
                    humidity: humVal,
                    lag_1: lagVal,
                    temp_x_hour_sin: Number((tempVal * 0.866025).toFixed(6)),
                },
                scenarios: selected,
            };

            let data;
            if (onRunStressTest) {
                data = await onRunStressTest(requestPayload);
            } else {
                let response;

                // 1. Try dev server proxy first (/predict/scenario) only in local development
                const isLocal =
                    typeof window !== 'undefined' &&
                    (window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.startsWith('192.168.') ||
                     window.location.hostname.startsWith('10.') ||
                     window.location.hostname.startsWith('172.'));

                if (isLocal) {
                    try {
                        const proxyRes = await fetch('/predict/scenario', {
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

            const resultsList = Array.isArray(data) ? data : (data?.results || []);
            const baseLoad = Number(data?.baseline_load_mw) || (resultsList.find((r) => (r.scenario_name || r.scenario) === 'Normal')?.predicted_load_mw) || (resultsList[0]?.predicted_load_mw ?? 0);

            // Normalize to rows the UI understands
            const normalized = resultsList.map((r) => {
                const sName = r.scenario_name ?? r.scenario ?? r.key ?? r.label;
                const meta = SCENARIOS.find((s) => s.key === sName);
                const predMw = Number(r.predicted_load_mw ?? r.predicted_mw ?? r.predictedMw ?? r.value ?? 0);
                const deltaMw = r.delta_mw !== undefined ? Number(r.delta_mw) : (predMw - baseLoad);
                const pctChange = r.pct_change !== undefined ? Number(r.pct_change) : (baseLoad ? (deltaMw / baseLoad) * 100 : 0);

                return {
                    key: meta?.key ?? sName,
                    label: meta?.label ?? sName,
                    desc: r.description ?? meta?.desc ?? '',
                    predictedMw: predMw,
                    deltaMw,
                    pctChange,
                };
            });

            setRows(normalized);
            setBaselineMw(baseLoad);
            if (data?.model_used) {
                setModelUsed(data.model_used);
            }
        } catch (err) {
            const isCorsError =
                err?.name === 'TypeError' &&
                (err?.message === 'Load failed' ||
                    err?.message?.includes('Failed to fetch') ||
                    err?.message?.includes('NetworkError'));

            if (isCorsError) {
                setError(
                    'CORS Error (Load failed): Phone origin (172.20.10.2:3000) is blocked by Render backend. Please set CORS_ORIGINS=* in your Render dashboard environment variables, or restart your frontend terminal (`npm start`) so the local proxy takes effect.'
                );
            } else {
                setError((err && err.message) || 'Stress test failed. Please try again.');
            }
        } finally {
            setRunning(false);
        }
    };

    /* ---------- impact summary rows ---------- */
    const summaryRows = useMemo(() => {
        if (!rows || !rows.length) return [];
        return rows.map((r) => ({
            scenario_name: r.label,
            predicted_mw: r.predictedMw,
            delta_mw: r.deltaMw,
            change_pct: r.pctChange,
            description: r.desc,
        }));
    }, [rows]);

    return (
        <div className="an">
            {/* ============ Top section: baseline + outcomes ============ */}
            <section className="an-top">
                {/* --- Baseline parameters --- */}
                <div className="an-card an-baseline-card">
                    <h2 className="an-card-title">Baseline Parameters</h2>
                    <div className="an-baseline-body">
                        <NumberStepper
                            label="Ambient Temperature (°C)"
                            value={baseline.temperatureC}
                            step={0.5}
                            onChange={(v) => setBaseline((b) => ({ ...b, temperatureC: v }))}
                        />
                        <NumberStepper
                            label="Relative Humidity (%)"
                            value={baseline.humidityPct}
                            step={1}
                            min={0}
                            max={100}
                            onChange={(v) => setBaseline((b) => ({ ...b, humidityPct: v }))}
                        />
                        <NumberStepper
                            label="Prior Hour Demand Lag_1 (MW)"
                            value={baseline.priorLag1Mw}
                            step={5}
                            onChange={(v) => setBaseline((b) => ({ ...b, priorLag1Mw: v }))}
                        />

                        <div className="an-field">
                            <label className="an-field-label">Scenarios to Evaluate</label>
                            <ScenarioMultiSelect options={SCENARIOS} value={selected} onChange={setSelected} />
                        </div>

                        <button
                            type="button"
                            className="an-btn primary"
                            onClick={runStressTest}
                            disabled={running || selected.length === 0}
                        >
                            {running ? (
                                <>
                                    <span className="an-spinner" aria-hidden="true" />
                                    Running…
                                </>
                            ) : (
                                <>
                                    <BoltIcon />
                                    Run Scenario Stress Test
                                </>
                            )}
                        </button>

                        {error && <p className="an-msg error">{error}</p>}
                    </div>
                </div>

                {/* --- Stress test outcomes --- */}
                <div className="an-card an-outcomes-card">
                    <div className="an-outcomes-header">
                        <div>
                            <h2 className="an-card-title">Stress Test Outcomes</h2>
                            <p className="an-card-sub">Scenario Stress Testing Forecast Comparison</p>
                        </div>
                        {rows && rows.length > 0 && (
                            <div className="an-outcomes-meta">
                                {modelUsed && (
                                    <span className="an-badge model">
                                        <BoltIcon /> {modelUsed}
                                    </span>
                                )}
                                <span className="an-badge baseline">
                                    Baseline: <strong>{fmtNum(baselineMw, 2)} MW</strong>
                                </span>
                            </div>
                        )}
                    </div>
                    {rows && rows.length > 0 ? (
                        <ScenarioBarChart rows={rows} baselineMw={baselineMw} />
                    ) : (
                        <div className="an-empty">
                            <p>No scenarios evaluated yet.</p>
                            <p className="an-empty-hint">
                                Choose scenarios on the left, then click <strong>Run Scenario Stress Test</strong>.
                            </p>
                        </div>
                    )}
                </div>
            </section>

            {/* ============ Scenario Impact Summary ============ */}
            <section className="an-card an-summary-card">
                <div className="an-summary-head">
                    <div>
                        <h2 className="an-card-title">Scenario Impact Summary</h2>
                        <p className="an-card-sub">Quantitative delta compared to operational baseline</p>
                    </div>
                    {summaryRows.length > 0 && (
                        <span className="an-badge baseline">
                            Evaluated: <strong>{summaryRows.length} scenario{summaryRows.length > 1 ? 's' : ''}</strong>
                        </span>
                    )}
                </div>
                {summaryRows.length === 0 ? (
                    <p className="an-empty-hint" style={{ marginTop: 12 }}>
                        Run the stress test to populate the impact summary table.
                    </p>
                ) : (
                    <div className="an-table-wrap">
                        <table className="an-table">
                            <thead>
                                <tr>
                                    <th>Scenario Name</th>
                                    <th className="num">Predicted Load (MW)</th>
                                    <th className="num">Delta vs Normal (MW)</th>
                                    <th className="num">Change (%)</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summaryRows.map((r) => (
                                    <tr key={r.scenario_name}>
                                        <td style={{ fontWeight: 600 }}>{r.scenario_name}</td>
                                        <td className="num">{fmtNum(r.predicted_mw, 2)} MW</td>
                                        <td className={`num ${r.delta_mw > 0 ? 'pos' : r.delta_mw < 0 ? 'neg' : ''}`}>
                                            {fmtSigned(r.delta_mw, 2)} MW
                                        </td>
                                        <td className={`num ${r.change_pct > 0 ? 'pos' : r.change_pct < 0 ? 'neg' : ''}`}>
                                            {fmtPct(r.change_pct, 2)}
                                        </td>
                                        <td className="desc">{r.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

export default Analysis;