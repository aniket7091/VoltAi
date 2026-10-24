import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Pypsa.css';

/* 
   PyPSA Linear Optimal Power Flow Dispatch Integration
   API Endpoint: /energy/dispatch
*/

const DIRECT_API_URL = 'https://voltai-backend-w7bt.onrender.com/energy/dispatch';

const DEFAULT_DISPATCH_PAYLOAD = {
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
    solar_profile: [
        0.0, 0.0, 0.0, 0.0, 0.0, 0.03,
        0.15, 0.32, 0.50, 0.65, 0.78, 0.85,
        0.90, 0.92, 0.85, 0.70, 0.50, 0.25,
        0.08, 0.0, 0.0, 0.0, 0.0, 0.0,
    ],
    include_load_shedding: false,
    load_shedding_cost: 100,
};

/* ---------- helpers ---------- */
const fmtNum = (n, d = 1) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = (n) => Number(n).toLocaleString('en-IN');
const fmtINR = (n) => `₹${fmtInt(Math.round(n))}`;

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
const ChevronIcon = () => <Svg size={16} className="py-chevron"><path d="m6 9 6 6 6-6" /></Svg>;
const BoltIcon = () => <Svg size={15}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></Svg>;
const InfoIcon = () => <Svg size={14}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></Svg>;
const CheckIcon = () => <Svg size={16}><path d="M20 6 9 17l-5-5" /></Svg>;
const MinusIcon = () => <Svg size={14}><path d="M5 12h14" /></Svg>;
const PlusIcon = () => <Svg size={14}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>;

/* 
   Stacked dispatch bar chart — 24 hours
    */
function DispatchBarChart({ hours }) {
    const wrapRef = useRef(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [hover, setHover] = useState(null);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const update = () => setSize((p) => (p.w === el.clientWidth && p.h === el.clientHeight ? p : { w: el.clientWidth, h: el.clientHeight }));
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const isMobile = size.w < 520;

    const geo = useMemo(() => {
        const { w, h } = size;
        if (!w || !h || !hours.length) return null;
        const leftMargin = w < 520 ? 64 : 68;
        const m = { top: 24, right: 16, bottom: 40, left: leftMargin };
        const iw = w - m.left - m.right;
        const ih = h - m.top - m.bottom;

        const maxY = Math.max(...hours.map((x) => x.demand_mw));
        const top = Math.ceil((maxY * 1.08) / 200) * 200;
        const range = top || 1;
        const n = hours.length;
        const slot = iw / n;
        const barW = Math.min(34, slot * 0.7);

        const x = (i) => m.left + slot * i + slot / 2;
        const y = (v) => m.top + ih - (v / range) * ih;
        const base = m.top + ih;
        const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((range / 4) * i));

        // baseline demand polyline points
        const demandPts = hours.map((hh, i) => `${x(i).toFixed(1)},${y(hh.demand_mw).toFixed(1)}`).join(' ');

        return { m, iw, ih, x, y, base, barW, yTicks, demandPts, n, slot };
    }, [size, hours]);

    const onMove = (e) => {
        if (!geo || !hours.length) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const idx = Math.floor(relX / geo.slot);
        setHover(Math.max(0, Math.min(hours.length - 1, idx)));
    };

    const hp = hover !== null && hours[hover] ? hours[hover] : null;

    return (
        <div className="py-chart" ref={wrapRef}>
            {geo && (
                <>
                    <svg width={size.w} height={size.h} role="img" aria-label="24-hour economic generation dispatch schedule">
                        {geo.yTicks.map((tv) => (
                            <g key={tv}>
                                <line className="py-grid" x1={geo.m.left} x2={size.w - geo.m.right} y1={geo.y(tv)} y2={geo.y(tv)} />
                                <text className="py-axis-text" x={geo.m.left - 8} y={geo.y(tv) + 3} textAnchor="end">{tv}</text>
                            </g>
                        ))}

                        {/* Hover column background highlight */}
                        {hover !== null && (
                            <rect
                                className="py-hover-band"
                                x={geo.x(hover) - geo.slot / 2}
                                y={geo.m.top}
                                width={geo.slot}
                                height={geo.ih}
                            />
                        )}

                        {hours.map((h, i) => {
                            const cx = geo.x(i);
                            const bx = cx - geo.barW / 2;
                            // stack bottom-up: coal -> gas -> solar
                            const coal = h.coal_mw;
                            const gas = h.gas_mw;
                            const solar = h.solar_mw;

                            const cY = geo.y(coal);
                            const gY = geo.y(coal + gas);
                            const sY = geo.y(coal + gas + solar);

                            const isHov = hover === i;

                            return (
                                <g key={h.hour} className={`py-bar-group ${isHov ? 'is-hover' : ''}`}>
                                    <rect className="py-bar coal" x={bx} y={cY} width={geo.barW} height={geo.base - cY} rx="1" />
                                    {gas > 0 && (
                                        <rect className="py-bar gas" x={bx} y={gY} width={geo.barW} height={cY - gY} />
                                    )}
                                    {solar > 0 && (
                                        <rect className="py-bar solar" x={bx} y={sY} width={geo.barW} height={gY - sY} />
                                    )}
                                </g>
                            );
                        })}

                        {/* Grid demand overlay */}
                        <polyline className="py-demand-line" points={geo.demandPts} />

                        {/* Demand point dot on hover */}
                        {hp && (
                            <circle
                                className="py-demand-dot"
                                cx={geo.x(hover)}
                                cy={geo.y(hp.demand_mw)}
                                r="4.5"
                            />
                        )}

                        {hours.map((h, i) => (
                            (i % 2 === 0) && (
                                <text key={`x-${h.hour}`} className={`py-axis-text ${hover === i ? 'active' : ''}`} x={geo.x(i)} y={geo.base + 16} textAnchor="middle">
                                    {h.hour}
                                </text>
                            )
                        ))}

                        <text className="py-axis-title" transform={`translate(${isMobile ? 12 : 14} ${geo.m.top + geo.ih / 2}) rotate(-90)`} textAnchor="middle">
                            Power (MW)
                        </text>
                        <text className="py-axis-title" x={geo.m.left + geo.iw / 2} y={size.h - 4} textAnchor="middle">
                            Hour (0 to 23)
                        </text>

                        {/* Transparent capture rect for mouse/touch tracking */}
                        <rect
                            x={geo.m.left}
                            y={geo.m.top}
                            width={geo.iw}
                            height={geo.ih}
                            fill="transparent"
                            style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
                            onPointerMove={onMove}
                            onPointerDown={onMove}
                            onPointerLeave={() => setHover(null)}
                        />
                    </svg>

                    {hp && (
                        <div
                            className={`py-tip ${geo.x(hover) > size.w * 0.62 ? 'flip' : ''}`}
                            style={{ left: `${geo.x(hover)}px` }}
                        >
                            <div className="py-tip-head">
                                <strong>Hour {hp.hour}:00</strong>
                                <span className="py-tip-demand">Demand: {fmtNum(hp.demand_mw, 1)} MW</span>
                            </div>
                            <div className="py-tip-body">
                                <div className="py-tip-row">
                                    <span className="py-tip-dot coal"></span>
                                    <span className="py-tip-name">Coal:</span>
                                    <span className="py-tip-val">{fmtNum(hp.coal_mw, 1)} MW</span>
                                </div>
                                <div className="py-tip-row">
                                    <span className="py-tip-dot gas"></span>
                                    <span className="py-tip-name">Gas:</span>
                                    <span className="py-tip-val">{fmtNum(hp.gas_mw, 1)} MW</span>
                                </div>
                                <div className="py-tip-row">
                                    <span className="py-tip-dot solar"></span>
                                    <span className="py-tip-name">Solar:</span>
                                    <span className="py-tip-val">{fmtNum(hp.solar_mw, 1)} MW</span>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/* 
   Donut chart — 24-hour energy generation mix
    */
function EnergyMixDonut({ summary }) {
    if (!summary || !summary.mix) return null;

    const mix = summary.mix;
    const coalPct = Number(mix.coal) || 0;
    const gasPct = Number(mix.gas) || 0;
    const solarPct = Number(mix.solar) || 0;
    const unservedMwh = Number(summary.unserved) || 0;
    const coalMwh = Number(summary.coalMwh) || 0;
    const gasMwh = Number(summary.gasMwh) || 0;
    const solarMwh = Number(summary.solarMwh) || 0;

    const totalMwh = Number(summary.totalEnergy) || (coalMwh + gasMwh + solarMwh) || 1;
    const unservedPct = totalMwh > 0 && unservedMwh > 0 ? (unservedMwh / totalMwh) * 100 : 0;

    const gwhTotal = (totalMwh / 1000).toFixed(1);
    const renewablePct = solarPct.toFixed(1);

    // SVG Geometry: Center at 280, 140. Radius = 80. Circumference = 2 * PI * 80 ≈ 502.65
    const C = 502.655;
    const cx = 280;
    const cy = 140;
    const R = 80;

    // Slices ordered clockwise from top: Gas Peaker (top), Coal Fleet (right/bottom), Solar Farm (left)
    const gasLen = Math.max(0, (gasPct / 100) * C);
    const coalLen = Math.max(0, (coalPct / 100) * C);
    const solarLen = Math.max(0, (solarPct / 100) * C);

    const gasOffset = 0;
    const coalOffset = -gasLen;
    const solarOffset = -(gasLen + coalLen);

    // Dynamic midpoint angles
    const gasAngle = -Math.PI / 2 + ((gasLen / 2) / C) * Math.PI * 2;
    const coalAngle = -Math.PI / 2 + ((gasLen + coalLen / 2) / C) * Math.PI * 2;
    const solarAngle = -Math.PI / 2 + ((gasLen + coalLen + solarLen / 2) / C) * Math.PI * 2;

    const ptOnRing = (angle) => ({
        x: Number((cx + R * Math.cos(angle)).toFixed(1)),
        y: Number((cy + R * Math.sin(angle)).toFixed(1)),
    });

    const gasPt = ptOnRing(gasAngle);
    // Anchor Coal leader line cleanly on the right arc
    const coalAnchorAngle = Math.min(Math.max(coalAngle, -0.1), Math.PI * 0.45);
    const coalPt = ptOnRing(coalAnchorAngle);
    const solarPt = ptOnRing(solarAngle);

    return (
        <div className="py-em-shell">
            {/* Header bar matching Feature.jsx */}
            <div className="py-em-header">
                <div className="py-em-header-left">
                    <span className="py-em-dot"></span>
                    <span className="py-em-title">24-HOUR ENERGY MIX</span>
                </div>
                <div className="py-em-stats">
                    <span className="py-em-stat-item">
                        <span className="py-em-stat-val">{gwhTotal}</span> GWh TOTAL
                    </span>
                    <span className="py-em-stat-divider"></span>
                    <span className="py-em-stat-item">
                        <span className="py-em-stat-val">{renewablePct}</span>% RENEWABLE
                    </span>
                </div>
            </div>

            {/* SVG Pie Chart Canvas */}
            <svg className="py-em-svg" viewBox="0 0 560 280" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <filter id="glowMixPypsa">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Background Ring */}
                <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(125, 140, 160, 0.15)" strokeWidth="30" />

                {/* Slices */}
                <g transform={`rotate(-90 ${cx} ${cy})`}>
                    {gasPct > 0 && (
                        <circle
                            cx={cx}
                            cy={cy}
                            r={R}
                            fill="none"
                            stroke="#F97316"
                            strokeWidth="30"
                            strokeDasharray={`${gasLen.toFixed(1)} ${C.toFixed(1)}`}
                            strokeDashoffset={gasOffset.toFixed(1)}
                            className="py-em-slice"
                        />
                    )}
                    {coalPct > 0 && (
                        <circle
                            cx={cx}
                            cy={cy}
                            r={R}
                            fill="none"
                            stroke="#64748B"
                            strokeWidth="30"
                            strokeDasharray={`${coalLen.toFixed(1)} ${C.toFixed(1)}`}
                            strokeDashoffset={coalOffset.toFixed(1)}
                            className="py-em-slice"
                        />
                    )}
                    {solarPct > 0 && (
                        <circle
                            cx={cx}
                            cy={cy}
                            r={R}
                            fill="none"
                            stroke="#F4C86A"
                            strokeWidth="30"
                            strokeDasharray={`${solarLen.toFixed(1)} ${C.toFixed(1)}`}
                            strokeDashoffset={solarOffset.toFixed(1)}
                            className="py-em-slice"
                        />
                    )}
                </g>

                {/* Center Label */}
                <text x={cx} y={cy - 4} className="py-em-center-val" textAnchor="middle">
                    {gwhTotal}
                </text>
                <text x={cx} y={cy + 16} className="py-em-center-unit" textAnchor="middle">
                    GWh TOTAL
                </text>

                {/* Pointers and Labels */}
                <g className="py-em-labels">
                    {/* Right side — Gas Peaker (top) */}
                    {gasPct > 0 && (
                        <g className="py-em-label-group">
                            <polyline
                                points={`${gasPt.x},${gasPt.y} 390,52 440,52`}
                                fill="none"
                                stroke="rgba(125, 140, 160, 0.3)"
                                strokeWidth="1"
                            />
                            <circle cx={gasPt.x} cy={gasPt.y} r="3.5" fill="#F97316" />
                            <text x="440" y="44" className="py-em-name gas" textAnchor="start">
                                GAS PEAKER
                            </text>
                            <text x="440" y="64" className="py-em-val" textAnchor="start">
                                {fmtNum(gasMwh, 0)} MWh{' '}
                                <tspan className="py-em-pct">({gasPct.toFixed(1)}%)</tspan>
                            </text>
                        </g>
                    )}

                    {/* Right side — Coal Fleet (middle/lower) */}
                    {coalPct > 0 && (
                        <g className="py-em-label-group">
                            <polyline
                                points={`${coalPt.x},${coalPt.y} 390,140 440,140`}
                                fill="none"
                                stroke="rgba(125, 140, 160, 0.3)"
                                strokeWidth="1"
                            />
                            <circle cx={coalPt.x} cy={coalPt.y} r="3.5" fill="#64748B" />
                            <text x="440" y="132" className="py-em-name coal" textAnchor="start">
                                COAL FLEET
                            </text>
                            <text x="440" y="152" className="py-em-val" textAnchor="start">
                                {fmtNum(coalMwh, 0)} MWh{' '}
                                <tspan className="py-em-pct">({coalPct.toFixed(1)}%)</tspan>
                            </text>
                        </g>
                    )}

                    {/* Left side — Solar Farm */}
                    {solarPct > 0 && (
                        <g className="py-em-label-group">
                            <polyline
                                points={`${solarPt.x},${solarPt.y} 170,110 120,110`}
                                fill="none"
                                stroke="rgba(125, 140, 160, 0.3)"
                                strokeWidth="1"
                            />
                            <circle cx={solarPt.x} cy={solarPt.y} r="3.5" fill="#F4C86A" />
                            <text x="120" y="102" className="py-em-name solar" textAnchor="end">
                                SOLAR FARM
                            </text>
                            <text x="120" y="122" className="py-em-val" textAnchor="end">
                                <tspan className="py-em-pct">({solarPct.toFixed(1)}%) </tspan>
                                {fmtNum(solarMwh, 0)} MWh
                            </text>
                        </g>
                    )}
                </g>
            </svg>

            {/* Bottom status row */}
            <div className="py-em-footer">
                {coalPct > 0 && (
                    <div className="py-em-source">
                        <span className="py-em-dot-pill" style={{ background: '#64748B' }}></span>
                        <span>Coal Fleet</span>
                        <strong>{coalPct.toFixed(1)}%</strong>
                    </div>
                )}
                {gasPct > 0 && (
                    <div className="py-em-source">
                        <span className="py-em-dot-pill" style={{ background: '#F97316' }}></span>
                        <span>Gas Peaker</span>
                        <strong>{gasPct.toFixed(1)}%</strong>
                    </div>
                )}
                {solarPct > 0 && (
                    <div className="py-em-source">
                        <span className="py-em-dot-pill" style={{ background: '#F4C86A' }}></span>
                        <span>Solar Farm</span>
                        <strong>{solarPct.toFixed(1)}%</strong>
                    </div>
                )}
                {unservedPct > 0 && (
                    <div className="py-em-source">
                        <span className="py-em-dot-pill" style={{ background: '#EF4444' }}></span>
                        <span>Unserved Load</span>
                        <strong>{unservedPct.toFixed(1)}%</strong>
                    </div>
                )}
            </div>
        </div>
    );
}

/* 
   Legend row for the dispatch bar chart
    */
function BarLegend() {
    const items = [
        { label: 'Grid Demand (MW)', type: 'line' },
        { label: 'Gas (₹6.0)', type: 'swatch', color: '#E8A33D' },
        { label: 'Coal (₹3.5)', type: 'swatch', color: '#7B8CA3' },
        { label: 'Solar (₹0.0)', type: 'swatch', color: '#F4C542' },
    ];
    return (
        <ul className="py-legend">
            {items.map((it) => (
                <li key={it.label}>
                    {it.type === 'line'
                        ? <span className="py-legend-line" />
                        : <span className="py-legend-swatch" style={{ background: it.color }} />}
                    <span>{it.label}</span>
                </li>
            ))}
        </ul>
    );
}


/* 
   Main component
    */
function Pypsa({ onSolve }) {
    /* --- optimization config --- */
    const [useExplicit, setUseExplicit] = useState(true);
    const [includeLoadShedding, setIncludeLoadShedding] = useState(false);
    const [loadSheddingPenalty, setLoadSheddingPenalty] = useState(100);
    const [panelOpen, setPanelOpen] = useState(true);

    /* --- result state --- */
    const [hours, setHours] = useState(null);
    const [summary, setSummary] = useState(null);
    const [status, setStatus] = useState(null); // 'optimal' | 'infeasible' | null
    const [provenanceNote, setProvenanceNote] = useState(null);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const popoverRef = useRef(null);
    const [solving, setSolving] = useState(false);
    const [error, setError] = useState(null);

    const closePopover = (e) => {
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }
        setPopoverOpen(false);
        if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    };

    /* close popover on outside click/tap on mobile and desktop */
    useEffect(() => {
        if (!popoverOpen) return;
        const handleOutside = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) {
                setPopoverOpen(false);
            }
        };
        document.addEventListener('pointerdown', handleOutside);
        return () => document.removeEventListener('pointerdown', handleOutside);
    }, [popoverOpen]);

    /* --- run solver (live API integration) --- */
    const handleSolve = async () => {
        setError(null);
        setSolving(true);
        try {
            // Build strictly validated payload depending on source choice
            const requestPayload = {
                include_load_shedding: Boolean(includeLoadShedding),
                load_shedding_cost: Number(loadSheddingPenalty) || 100,
                solar_profile: DEFAULT_DISPATCH_PAYLOAD.solar_profile,
            };

            if (useExplicit) {
                // Choice 1: Explicit 24-hour demand profile
                requestPayload.demand_mw = DEFAULT_DISPATCH_PAYLOAD.demand_mw;
                requestPayload.use_forecast_24h = false;
            } else {
                // Choice 2: Phase 4 24h recursive forecast (demand_mw MUST be omitted)
                requestPayload.use_forecast_24h = true;
                requestPayload.weather_forecasts = DEFAULT_DISPATCH_PAYLOAD.weather_forecasts;
                requestPayload.calendar_overrides = Array(24).fill(DEFAULT_DISPATCH_PAYLOAD.calendar_overrides[0]);
            }

            let data;
            if (onSolve) {
                data = await onSolve(requestPayload);
            } else {
                let response;

                // 1. Try local dev server proxy first (/energy/dispatch) ONLY in local dev environment
                const isLocal =
                    typeof window !== 'undefined' &&
                    (window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.startsWith('192.168.') ||
                     window.location.hostname.startsWith('10.') ||
                     window.location.hostname.startsWith('172.'));

                if (isLocal) {
                    try {
                        const proxyRes = await fetch('/energy/dispatch', {
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
                    let errMsg = `Dispatch solver error (${response.status})`;
                    try {
                        const errJson = await response.json();
                        errMsg = errJson.detail || errJson.message || JSON.stringify(errJson);
                    } catch {
                        const errText = await response.text();
                        if (errText) errMsg += `: ${errText}`;
                    }
                    throw new Error(errMsg);
                }

                data = await response.json();
            }

            const schedule = (data?.hourly_schedule || []).map((h) => ({
                hour: h.hour,
                timestamp: h.timestamp || '',
                demand_mw: Number(h.demand_mw) || 0,
                coal_mw: Math.max(0, Number(h.coal_mw) || 0),
                gas_mw: Math.max(0, Number(h.gas_mw) || 0),
                solar_mw: Math.max(0, Number(h.solar_mw) || 0),
                unserved_mw: Math.max(0, Number(h.unserved_mw) || 0),
                hourly_cost: Number(h.hourly_cost) || 0,
            }));

            const coalMwh = Number(data?.coal_total_mwh) || schedule.reduce((sum, h) => sum + h.coal_mw, 0);
            const gasMwh = Number(data?.gas_total_mwh) || schedule.reduce((sum, h) => sum + h.gas_mw, 0);
            const solarMwh = Number(data?.solar_total_mwh) || schedule.reduce((sum, h) => sum + h.solar_mw, 0);
            const unservedMwh = Number(data?.unserved_energy_mwh) || schedule.reduce((sum, h) => sum + h.unserved_mw, 0);
            const totalDisp = coalMwh + gasMwh + solarMwh;
            const totalMwh = Number(data?.total_demand_mwh) || totalDisp || 1;

            const summ = {
                totalCost: Number(data?.total_cost) || 0,
                totalEnergy: totalMwh,
                peakDemand: Number(data?.peak_demand_mw) || 0,
                unserved: unservedMwh,
                coalMwh,
                gasMwh,
                solarMwh,
                mix: {
                    coal: data?.coal_share_pct !== undefined ? Number(data.coal_share_pct) : (totalDisp ? (coalMwh / totalDisp) * 100 : 0),
                    gas: data?.gas_share_pct !== undefined ? Number(data.gas_share_pct) : (totalDisp ? (gasMwh / totalDisp) * 100 : 0),
                    solar: data?.solar_share_pct !== undefined ? Number(data.solar_share_pct) : (totalDisp ? (solarMwh / totalDisp) * 100 : 0),
                },
                solverUsed: data?.solver_used || 'PyPSA / HiGHS',
            };

            setHours(schedule);
            setSummary(summ);
            setStatus(data?.optimization_status || (data?.is_optimal ? 'optimal' : 'feasible'));
            setProvenanceNote(data?.provenance_note || '');
        } catch (err) {
            const isCorsError =
                err?.name === 'TypeError' &&
                (err?.message === 'Load failed' ||
                    err?.message?.includes('Failed to fetch') ||
                    err?.message?.includes('NetworkError'));

            if (isCorsError) {
                setError(
                    'Network error connecting to backend. If accessing from phone on LAN (172.20.10.2:3000), please ensure your dev server is active and reachable.'
                );
            } else {
                setError((err && err.message) || 'Dispatch solver failed. Please try again.');
            }
            setStatus(null);
        } finally {
            setSolving(false);
        }
    };

    /* --- penalty stepper helpers --- */
    const bumpPenalty = (dir) => setLoadSheddingPenalty((v) => Math.max(0, Number(v) + dir * 10));

    return (
        <div className="py">
            {/* ============ DEMAND INPUT SOURCE ============ */}
            <section className="py-card py-source-card">
                <span className="py-field-label">Demand Input Source</span>
                <div className="py-radio-row" role="radiogroup" aria-label="Demand input source">
                    <label className={`py-radio ${useExplicit ? 'on' : ''}`}>
                        <input
                            type="radio"
                            name="demand-source"
                            checked={useExplicit}
                            onChange={() => setUseExplicit(true)}
                        />
                        <span className="py-radio-dot" />
                        <span>Use Explicit 24-Hour Profile</span>
                    </label>
                    <label className={`py-radio ${!useExplicit ? 'on' : ''}`}>
                        <input
                            type="radio"
                            name="demand-source"
                            checked={!useExplicit}
                            onChange={() => setUseExplicit(false)}
                        />
                        <span className="py-radio-dot" />
                        <span>Consume Phase 4 24h Recursive Forecast</span>
                    </label>
                </div>
            </section>

            {/* ============ OPTIMIZATION PARAMETERS (collapsible) ============ */}
            <section className={`py-card py-opt-card ${panelOpen ? 'open' : ''}`}>
                <button
                    type="button"
                    className="py-opt-trigger"
                    aria-expanded={panelOpen}
                    onClick={() => setPanelOpen((o) => !o)}
                >
                    <ChevronIcon />
                    <span>Optimization Parameters</span>
                </button>

                <div className={`py-collapse ${panelOpen ? 'open' : ''}`}>
                    <div className="py-collapse-inner">
                        <div className="py-opt-body">
                            <label className="py-check">
                                <input
                                    type="checkbox"
                                    checked={includeLoadShedding}
                                    onChange={(e) => setIncludeLoadShedding(e.target.checked)}
                                />
                                <span className="py-check-box" />
                                <span className="py-check-text">
                                    Include Unserved Energy Generator (Load Shedding)
                                </span>
                                <span className="py-hint" title="If enabled, unmet demand is served by a virtual generator at the specified penalty cost.">
                                    <InfoIcon />
                                </span>
                            </label>

                            <div className="py-field">
                                <label className="py-field-label" htmlFor="py-penalty">Load Shedding Penalty (₹/MWh)</label>
                                <div className="py-stepper">
                                    <button type="button" className="py-step-btn" onClick={() => bumpPenalty(-1)} aria-label="Decrease penalty"><MinusIcon /></button>
                                    <input
                                        id="py-penalty"
                                        className="py-step-input"
                                        type="number"
                                        step="10"
                                        min="0"
                                        value={loadSheddingPenalty}
                                        onChange={(e) => setLoadSheddingPenalty(e.target.value)}
                                        onBlur={(e) => setLoadSheddingPenalty(Math.max(0, Number(e.target.value) || 0))}
                                    />
                                    <button type="button" className="py-step-btn" onClick={() => bumpPenalty(1)} aria-label="Increase penalty"><PlusIcon /></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ============ SOLVE BUTTON ============ */}
            <div className="py-actions">
                <button type="button" className="py-btn primary" onClick={handleSolve} disabled={solving}>
                    {solving ? (
                        <>
                            <span className="py-spinner" aria-hidden="true" />
                            Solving Dispatch…
                        </>
                    ) : (
                        <>
                            <BoltIcon />
                            Solve Dispatch Optimization
                        </>
                    )}
                </button>
                {status && (
                    <span className="py-status-badge optimal">
                        <CheckIcon /> {status.toUpperCase()}
                    </span>
                )}
                {error && <span className="py-msg error">{error}</span>}
            </div>


            {/* ============ KPI ROW ============ */}
            {summary && (
                <section className="py-kpis" aria-label="Optimization summary">
                    <div className="py-kpi primary">
                        <div className="py-kpi-label">
                            Total 24h Cost
                            <span className="py-hint"><InfoIcon /></span>
                        </div>
                        <div className="py-kpi-value">{fmtINR(summary.totalCost)}</div>
                    </div>
                    <div className="py-kpi">
                        <div className="py-kpi-label">
                            Total Energy Dispatched
                            <span className="py-hint"><InfoIcon /></span>
                        </div>
                        <div className="py-kpi-value">{fmtNum(summary.totalEnergy, 1)} <span className="py-kpi-unit">MWh</span></div>
                    </div>
                    <div className="py-kpi">
                        <div className="py-kpi-label">
                            Peak Demand
                            <span className="py-hint"><InfoIcon /></span>
                        </div>
                        <div className="py-kpi-value">{fmtNum(summary.peakDemand, 1)} <span className="py-kpi-unit">MW</span></div>
                    </div>
                    <div className="py-kpi">
                        <div className="py-kpi-label">Unserved Energy</div>
                        <div className="py-kpi-value">{fmtNum(summary.unserved, 1)} <span className="py-kpi-unit">MWh</span></div>
                        <span className="py-badge">↑ {summary.mix.solar.toFixed(1)}% Solar</span>
                    </div>
                </section>
            )}

            {/* ============ CHARTS ROW ============ */}
            {hours && summary && (
                <section className="py-charts-row">
                    <div className="py-card py-chart-card">
                        <div className="py-chart-head">
                            <div className="py-chart-title-wrap">
                                <h2 className="py-card-title">24-Hour Economic Generation Dispatch Schedule</h2>
                                {provenanceNote && (
                                    <div
                                        ref={popoverRef}
                                        className={`py-provenance-tooltip-wrap ${popoverOpen ? 'open' : ''}`}
                                        onMouseEnter={() => {
                                            if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                                                setPopoverOpen(true);
                                            }
                                        }}
                                        onMouseLeave={() => {
                                            if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                                                setPopoverOpen(false);
                                            }
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="py-help-btn"
                                            aria-label="View dispatch provenance notes"
                                            aria-expanded={popoverOpen}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPopoverOpen((o) => !o);
                                            }}
                                        >
                                            ?
                                        </button>
                                        {popoverOpen && (
                                            <div
                                                className="py-provenance-popover open"
                                                role="tooltip"
                                                onClick={(e) => e.stopPropagation()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                            >
                                                <div className="py-popover-head">
                                                    <div className="py-popover-title">Model Provenance & Fleet Config</div>
                                                    <button
                                                        type="button"
                                                        className="py-popover-close"
                                                        aria-label="Close notes"
                                                        onClick={closePopover}
                                                        onPointerDown={(e) => {
                                                            e.stopPropagation();
                                                        }}
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                            <line x1="3" y1="3" x2="11" y2="11" />
                                                            <line x1="11" y1="3" x2="3" y2="11" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <div className="py-popover-desc">{provenanceNote}</div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <BarLegend />
                        </div>
                        <DispatchBarChart hours={hours} />
                    </div>

                    <div className="py-card py-donut-card">
                        <EnergyMixDonut summary={summary} />
                    </div>
                </section>
            )}

            {/* ============ DETAILED TABLE ============ */}
            {hours && (
                <section className="py-card py-table-card">
                    <h2 className="py-card-title">Detailed 24-Hour Dispatch Schedule Table</h2>
                    <div className="py-table-wrap">
                        <table className="py-table">
                            <thead>
                                <tr>
                                    <th className="cell-hour">Hour</th>
                                    <th className="cell-ts">Timestamp</th>
                                    <th className="num">Demand (MW)</th>
                                    <th className="num">Coal (MW)</th>
                                    <th className="num">Gas (MW)</th>
                                    <th className="num">Solar (MW)</th>
                                    <th className="num">Unserved (MW)</th>
                                    <th className="num">Hourly Cost (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hours.map((h) => (
                                    <tr key={h.hour}>
                                        <td className="cell-hour">{h.hour}</td>
                                        <td className="mono cell-ts">{h.timestamp}</td>
                                        <td className="num">{fmtNum(h.demand_mw, 1)}</td>
                                        <td className="num">{fmtNum(h.coal_mw, 1)}</td>
                                        <td className="num">{fmtNum(h.gas_mw, 1)}</td>
                                        <td className="num">{fmtNum(h.solar_mw, 1)}</td>
                                        <td className="num">{fmtNum(h.unserved_mw, 1)}</td>
                                        <td className="num">{fmtNum(h.hourly_cost, 2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}

export default Pypsa;