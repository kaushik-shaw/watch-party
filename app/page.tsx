'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

import { useRouter } from 'next/navigation';

// ─── Hand-drawn Doodle SVGs matching reference image exactly ───────────────


const DoodleCrown = () => (
  <svg width="48" height="36" viewBox="0 0 54 40" fill="none" className="select-none pointer-events-none">
    <path
      d="M5 34 L10 12 L22 22 L27 4 L33 22 L44 12 L49 34 Z"
      fill="#FFBA00"
      stroke="#1A1614"
      strokeWidth="2.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
    <path d="M6 34 L48 34" stroke="#1A1614" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

const YellowRays = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="select-none pointer-events-none">
    <path d="M6 26 L2 18" stroke="#FFBA00" strokeWidth="3" strokeLinecap="round" />
    <path d="M12 28 L14 14" stroke="#FFBA00" strokeWidth="3" strokeLinecap="round" />
    <path d="M26 26 L20 20" stroke="#FFBA00" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const RedRaysSmall = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="select-none pointer-events-none">
    <path d="M8 6 L14 14" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M22 8 L18 16" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M24 22 L16 18" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

const DoodleArrowLeft = () => (
  <svg width="72" height="56" viewBox="0 0 72 56" fill="none" className="select-none pointer-events-none" style={{ overflow: 'visible' }}>
    {/* Thick white border underneath */}
    <path
      d="M14 10 C 20 34, 38 42, 56 40"
      stroke="white"
      strokeWidth="11"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M48 30 L58 40 L46 47"
      stroke="white"
      strokeWidth="11"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* Thick red arrow on top */}
    <path
      d="M14 10 C 20 34, 38 42, 56 40"
      stroke="#E62719"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M48 30 L58 40 L46 47"
      stroke="#E62719"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DoodleArrowRight = () => (
  <svg width="72" height="56" viewBox="0 0 72 56" fill="none" className="select-none pointer-events-none" style={{ overflow: 'visible' }}>
    {/* Thick white border underneath */}
    <path
      d="M58 10 C 52 34, 34 42, 16 40"
      stroke="white"
      strokeWidth="11"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M26 30 L16 40 L28 47"
      stroke="white"
      strokeWidth="11"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    {/* Thick red arrow on top */}
    <path
      d="M58 10 C 52 34, 34 42, 16 40"
      stroke="#E62719"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M26 30 L16 40 L28 47"
      stroke="#E62719"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ScribbleUnderline = () => (
  <svg viewBox="0 0 500 42" fill="none" className="w-full h-auto select-none pointer-events-none">
    {/* Primary arched hand-drawn scribble line */}
    <path
      d="M 10,32 C 60,26 120,20 180,15 C 230,11 270,11 320,13 C 370,16 430,22 490,32"
      stroke="#E62719"
      strokeWidth="5"
      strokeLinecap="round"
    />
    {/* Secondary organic marker accent */}
    <path
      d="M 45,34 C 110,24 190,16 265,14 C 335,13 400,19 460,28"
      stroke="#E62719"
      strokeWidth="2.5"
      strokeLinecap="round"
      opacity="0.8"
    />
  </svg>
);

const HostDashesLeft = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="select-none pointer-events-none">
    {/* Top radiating dash (pointing up-left: \) */}
    <path d="M5 6 L17 10.5" stroke="#E62719" strokeWidth="3.6" strokeLinecap="round" />
    {/* Middle radiating dash (pointing left: -) */}
    <path d="M2 12 L15 12" stroke="#E62719" strokeWidth="3.8" strokeLinecap="round" />
    {/* Bottom radiating dash (pointing down-left: /) */}
    <path d="M5 18 L17 13.5" stroke="#E62719" strokeWidth="3.6" strokeLinecap="round" />
  </svg>
);

const HostDashesRight = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="select-none pointer-events-none">
    {/* Top radiating dash (pointing up-right: /) */}
    <path d="M7 10.5 L19 6" stroke="#E62719" strokeWidth="3.6" strokeLinecap="round" />
    {/* Middle radiating dash (pointing right: -) */}
    <path d="M9 12 L22 12" stroke="#E62719" strokeWidth="3.8" strokeLinecap="round" />
    {/* Bottom radiating dash (pointing down-right: \) */}
    <path d="M7 13.5 L19 18" stroke="#E62719" strokeWidth="3.6" strokeLinecap="round" />
  </svg>
);

const MovieNightDashes = () => (
  <svg width="24" height="40" viewBox="0 0 24 40" fill="none" className="select-none pointer-events-none">
    <path d="M20 6 L6 10" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M22 18 L4 18" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M20 30 L6 26" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

const CurlyArrowBesideGhost = () => (
  <svg width="34" height="46" viewBox="0 0 34 46" fill="none" className="select-none pointer-events-none">
    <path
      d="M10 4 C 28 8, 26 28, 12 36"
      stroke="#E62719"
      strokeWidth="2.8"
      strokeLinecap="round"
    />
    <path
      d="M6 30 L12 37 L20 32"
      stroke="#E62719"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ─── Main Component ─────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const [createName, setCreateName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [navReady, setNavReady] = useState(false);
  const [headlineReady, setHeadlineReady] = useState(false);
  const [contentReady, setContentReady] = useState(false);

  // Loading & error states
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinNameError, setJoinNameError] = useState<string | null>(null);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

  // Refs
  const watchYoutubeRef = useRef<SVGTextPathElement>(null);
  const togetherRef = useRef<SVGTextPathElement>(null);
  const headlineContainerRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Pre-seed demo rooms in localStorage for immediate testing
    try {
      const existing = localStorage.getItem('wp_rooms');
      if (!existing) {
        localStorage.setItem(
          'wp_rooms',
          JSON.stringify({
            PARTY1: { host: 'Alex', createdAt: Date.now() },
            WATCH1: { host: 'Sam', createdAt: Date.now() },
          })
        );
      }
    } catch {
      // ignore
    }

    // 1. Fade out the loader
    const loaderTimer = setTimeout(() => setIsLoading(false), 600);
    // 2. Nav drops FIRST
    const navTimer = setTimeout(() => setNavReady(true), 700);
    // 3. Headline sweeps along the arc after nav lands
    const headlineTimer = setTimeout(() => setHeadlineReady(true), 1200);
    // 4. Content below fades up after headline settles
    const contentTimer = setTimeout(() => setContentReady(true), 2300);

    return () => {
      clearTimeout(loaderTimer);
      clearTimeout(navTimer);
      clearTimeout(headlineTimer);
      clearTimeout(contentTimer);
    };
  }, []);

  // Modal behavior: Esc key to close and autofocus input
  useEffect(() => {
    if (!isCreateModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCreateModalOpen(false);
        setCreateError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isCreateModalOpen]);

  // Animate textPath startOffset: text slides along the SVG arc
  // Spring-decay easing for smooth overshoot + settle
  const springEase = useCallback((t: number): number => {
    const decay = Math.exp(-6 * t);
    const oscillation = Math.sin(t * Math.PI * 1.8);
    return 1 - decay * (1 - oscillation * 0.35);
  }, []);

  useEffect(() => {
    if (!headlineReady) return;

    const duration = 1000; // ms
    const startTime = performance.now();

    // Start offset values: from far left (-60%) to center (50%)
    const fromOffset = -60;
    const toOffset = 50;
    const range = toOffset - fromOffset; // 110

    // Show the container
    if (headlineContainerRef.current) {
      headlineContainerRef.current.style.opacity = '1';
    }

    let rafId: number;
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const rawProgress = Math.min(elapsed / duration, 1);
      const easedProgress = springEase(rawProgress);
      const offset = fromOffset + range * easedProgress;

      const offsetStr = `${offset}%`;
      if (watchYoutubeRef.current) {
        watchYoutubeRef.current.setAttribute('startOffset', offsetStr);
      }
      if (togetherRef.current) {
        togetherRef.current.setAttribute('startOffset', offsetStr);
      }

      if (rawProgress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [headlineReady, springEase]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError('Please enter your name');
      return;
    }
    setCreateError(null);
    setIsCreating(true);

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      const rooms = JSON.parse(localStorage.getItem('wp_rooms') || '{}');
      rooms[code] = { host: createName.trim(), createdAt: Date.now() };
      localStorage.setItem('wp_rooms', JSON.stringify(rooms));
    } catch {
      // ignore
    }

    showToast(`🎉 Creating room ${code}...`);
    setTimeout(() => {
      setIsCreating(false);
      setIsCreateModalOpen(false);
      router.push(`/room/${code}?username=${encodeURIComponent(createName.trim())}`);
    }, 600);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    if (!joinName.trim()) {
      setJoinNameError('Please enter your name');
      hasError = true;
    }
    if (!joinCode.trim()) {
      setJoinCodeError('Please enter a room code');
      hasError = true;
    } else if (joinCode.trim().length < 6) {
      setJoinCodeError('Room code must be 6 characters');
      hasError = true;
    }

    if (hasError) return;

    setJoinNameError(null);
    setJoinCodeError(null);
    setIsJoining(true);

    const code = joinCode.trim().toUpperCase();

    setTimeout(() => {
      let roomFound = false;
      try {
        const rooms = JSON.parse(localStorage.getItem('wp_rooms') || '{}');
        if (rooms[code] || ['PARTY1', 'WATCH1', 'DEMO01'].includes(code)) {
          roomFound = true;
        }
      } catch {
        // fallback
      }

      if (!roomFound) {
        setIsJoining(false);
        setJoinCodeError('Room not found. Check code or create a room.');
        return;
      }

      showToast(`🍿 Joining room ${code}...`);
      setTimeout(() => {
        setIsJoining(false);
        router.push(`/room/${code}?username=${encodeURIComponent(joinName.trim())}`);
      }, 500);
    }, 600);
  };

  return (
    <div
      className="relative w-full h-screen max-h-screen flex flex-col justify-between overflow-hidden selection:bg-red-500 selection:text-white"
      style={{ backgroundColor: '#F4EBD9' }}
    >
      {/* Page Loader */}
      <div
        className={`fixed inset-0 z-[999] flex flex-col items-center justify-center transition-opacity duration-300 ease-out select-none ${
          isLoading ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: '#F4EBD9' }}
      >
        <div className="flex flex-col items-center gap-4">
          <span
            className="text-[#E62719] text-6xl sm:text-7xl tracking-normal animate-pulse select-none"
            style={{
              fontFamily: "'Modak', cursive",
              WebkitTextStroke: '6px white',
              paintOrder: 'stroke fill',
            }}
          >
            WATCHPARTY
          </span>
          <div className="flex items-center gap-2.5">
            <span className="w-3.5 h-3.5 rounded-full bg-[#E62719] animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-3.5 h-3.5 rounded-full bg-[#E62719] animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-3.5 h-3.5 rounded-full bg-[#E62719] animate-bounce"></span>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-6 py-2.5 bg-[#1A1614] text-[#F4EBD9] text-sm font-semibold rounded-full shadow-2xl animate-fade-in pointer-events-none">
          {toast}
        </div>
      )}

      {/* Bottom-left Character Illustration - visible on 2xl (1536px+) to prevent collisions on laptops & phones */}
      <div className={`hidden 2xl:block absolute bottom-0 left-0 z-10 pointer-events-none select-none ${
        contentReady ? 'animate-pop-left' : 'opacity-0'
      }`}>
        <img
          src="/pic1.webp"
          alt="Watching party illustration"
          className="w-[500px] 2xl:w-[580px] h-auto object-contain -ml-12 -mb-15 rotate-[-2deg] origin-bottom-left"
        />
      </div>

      {/* Bottom-right Character Illustration - visible on 2xl (1536px+) to prevent collisions on laptops & phones */}
      <div className={`hidden 2xl:block absolute bottom-0 -right-8 z-10 pointer-events-none select-none ${
        contentReady ? 'animate-pop-right' : 'opacity-0'
      }`}>
        <img
          src="/pic2.webp"
          alt="Watching party ghost illustration"
          className="w-[500px] 2xl:w-[580px] h-auto object-contain -mr-12 -mb-15 rotate-[2deg] origin-bottom-right"
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          1. TOP NAVIGATION
          ══════════════════════════════════════════════════════════════════════ */}
      <nav className="relative z-30 flex items-center justify-between px-6 sm:px-10 pt-4 pb-1 flex-shrink-0">
        {/* LOGO: Modak font in red */}
        <button
          onClick={() => router.push('/')}
          className={`cursor-pointer hover:opacity-90 active:scale-95 text-left ${
            navReady ? 'animate-drop-bounce' : 'opacity-0 pointer-events-none'
          }`}
        >
          <span
            className="text-[#E62719] text-5xl sm:text-6xl tracking-normal select-none"
            style={{
              fontFamily: "'Modak', cursive",
              lineHeight: 1,
              WebkitTextStroke: '5px white',
              paintOrder: 'stroke fill',
            }}
          >
            WATCHPARTY
          </span>
        </button>

        {/* Top-right "CREATE ROOM" button */}
        <button
          onClick={() => {
            setIsCreateModalOpen(true);
            setCreateError(null);
          }}
          className={`cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white px-5 sm:px-6 py-2 sm:py-2.5 rounded-full font-modak text-base sm:text-lg tracking-wider border-[2.5px] border-[#18181B] shadow-[0_4px_0_#18181B] active:translate-y-[3px] active:shadow-[0_1px_0_#18181B] select-none flex items-center gap-1.5 sm:gap-2 ${
            navReady ? 'animate-drop-bounce-delay' : 'opacity-0 pointer-events-none'
          }`}
        >
          <span className="text-xl sm:text-2xl leading-none font-bold select-none">+</span>
          <span>CREATE ROOM</span>
        </button>
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════
          2. GIANT HERO HEADLINE: "WATCH YOUTUBE" & "TOGETHER, IN SYNC."
          ══════════════════════════════════════════════════════════════════════ */}
      <div
        ref={headlineContainerRef}
        className="relative z-10 flex flex-col items-center justify-center flex-shrink-0 px-4 pt-1 pb-2"
        style={{ opacity: 0 }}
      >
        {/* "WATCH YOUTUBE" — SVG textPath arch for mathematically even curve */}
        <div className="w-full max-w-[1060px] mx-auto select-none px-2" aria-label="WATCH YOUTUBE" style={{ marginBottom: '-1.5rem' }}>
          <svg
            viewBox="0 0 1300 270"
            className="w-full h-auto"
            style={{ overflow: 'visible' }}
          >
            <defs>
              <path
                id="watchYoutubePath"
                d="M 30,240 A 2100,2100 0 0,1 1270,240"
                fill="none"
              />
            </defs>

            <text
              style={{
                fontFamily: "'Ranchers', cursive",
                fontSize: '175px',
                fill: '#E62719',
                stroke: 'white',
                strokeWidth: '15px',
                paintOrder: 'stroke fill',
                strokeLinejoin: 'round',
              }}
            >
              <textPath
                ref={watchYoutubeRef}
                href="#watchYoutubePath"
                startOffset="-60%"
                textAnchor="middle"
              >
                WATCH YOUTUBE
              </textPath>
            </text>

            {/* Accent lines on upper-left of "WATCH" */}
            <g className="select-none pointer-events-none">
              <line x1="45" y1="55" x2="22" y2="34" stroke="#E62719" strokeWidth="9.5" strokeLinecap="round" />
              <line x1="38" y1="78" x2="10" y2="70" stroke="#E62719" strokeWidth="9.5" strokeLinecap="round" />
            </g>

            {/* Accent lines on upper-right of "YOUTUBE" */}
            <g className="select-none pointer-events-none">
              <line x1="1255" y1="55" x2="1278" y2="34" stroke="#E62719" strokeWidth="9.5" strokeLinecap="round" />
              <line x1="1262" y1="78" x2="1290" y2="70" stroke="#E62719" strokeWidth="9.5" strokeLinecap="round" />
            </g>
          </svg>
        </div>

        {/* "TOGETHER, IN SYNC." */}
        <div className="relative -mt-2 sm:-mt-1 md:-mt-2 lg:-mt-20 w-full max-w-[740px] mx-auto flex flex-col items-center select-none z-20">
          <svg
            viewBox="0 0 1000 145"
            className="w-full h-auto"
            style={{ overflow: 'visible' }}
          >
            <defs>
              <path
                id="togetherInSyncPath"
                d="M 30,120 A 3000,3000 0 0,1 970,120"
                fill="none"
              />
            </defs>
            <text
              style={{
                fontFamily: "'Modak', cursive",
                fontSize: '92px',
                fill: '#FFBA00',
                stroke: 'white',
                strokeWidth: '15px',
                paintOrder: 'stroke fill',
                strokeLinejoin: 'round',
                letterSpacing: '2px',
              }}
            >
              <textPath
                ref={togetherRef}
                href="#togetherInSyncPath"
                startOffset="-60%"
                textAnchor="middle"
              >
                TOGETHER, IN SYNC
              </textPath>
            </text>
          </svg>

          {/* Hand-drawn red scribble underline */}
          <div className="w-[85%] sm:w-[92%] -mt-10 sm:-mt-11">
            <ScribbleUnderline />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          3. MAIN INTERACTION STAGE
          ══════════════════════════════════════════════════════════════════════ */}
      <div className={`relative flex items-center justify-center flex-1 w-full max-w-[1400px] mx-auto px-4 ${
        contentReady ? 'animate-fade-rise' : 'opacity-0 pointer-events-none'
      }`}>

        {/* ── CENTRAL JOIN ROOM CARD WITH FLANKING ANNOTATIONS ── */}
        <div className="relative flex items-center justify-center w-full">
          <div
            className="relative flex items-center justify-center w-full max-w-[360px] z-10"
            style={{ transform: 'translateY(-14px)' }}
          >

            {/* ── LEFT ANNOTATION: "DISTANCE FEELS CLOSER" (hidden on mobile/tablet to avoid overflow) ── */}
            <div
              className="hidden lg:flex absolute -left-44 sm:-left-56 md:-left-68 lg:-left-76 top-[-10px] sm:top-[-20px] flex-col items-center select-none z-20 pointer-events-none"
              style={{ transform: 'rotate(-12deg)' }}
            >
              <span
                className="font-modak text-[#FFBA00] text-center uppercase leading-[1.05]"
                style={{
                  fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)',
                  WebkitTextStroke: '7px white',
                  paintOrder: 'stroke fill',
                }}
              >
                DISTANCE<br />FEELS<br />CLOSER
              </span>
              <div className="mt-1 ml-17 sm:ml-18">
                <DoodleArrowLeft />
              </div>
            </div>

            {/* ── RIGHT ANNOTATION: "SAME VIDEO SAME VIBES" (hidden on mobile/tablet to avoid overflow) ── */}
            <div
              className="hidden lg:flex absolute -right-40 sm:-right-52 md:-right-64 lg:-right-72 top-[-10px] sm:top-[-20px] flex-col items-center select-none z-20 pointer-events-none"
              style={{ transform: 'rotate(12deg)' }}
            >
              <span
                className="font-modak text-[#FFBA00] text-center uppercase leading-[1.05]"
                style={{
                  fontSize: 'clamp(1.1rem, 2vw, 1.55rem)',
                  WebkitTextStroke: '6px white',
                  paintOrder: 'stroke fill',
                }}
              >
                SAME<br />VIDEO<br />SAME<br />VIBES
              </span>
              <div className="mt-1 mr-4">
                <DoodleArrowRight />
              </div>
            </div>

            {/* CARD: JOIN A ROOM (Centered) */}
            <div
              className="w-full bg-white rounded-[26px] border-[4.5px] border-[#383838] p-5 sm:p-6 flex flex-col shadow-[0_6px_24px_rgba(0,0,0,0.08)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-all"
            >
              <div>
                {/* Title */}
                <div className="flex items-center justify-center mb-3">
                  <h3
                    className="font-mouse text-[#E62719] text-3xl sm:text-4xl lg:text-[46px] uppercase tracking-wider leading-none select-none text-center"
                  >
                    JOIN A ROOM
                  </h3>
                </div>

                <form onSubmit={handleJoin} className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-[#1A1614] mb-1.5 font-outfit">
                      Your name
                    </label>
                    <input
                      type="text"
                      value={joinName}
                      onChange={(e) => {
                        setJoinName(e.target.value);
                        if (joinNameError) setJoinNameError(null);
                      }}
                      placeholder="Enter your name"
                      className={`w-full px-4 py-2.5 sm:py-2.5 bg-[#F4EBD9] border-[1.5px] ${
                        joinNameError ? 'border-[#E62719] ring-2 ring-[#E62719]/20' : 'border-[#D8CBB8]'
                      } rounded-xl text-sm font-outfit text-[#1A1614] placeholder:text-[#64594A] focus:outline-none focus:border-[#E62719] focus:bg-white transition`}
                    />
                    {joinNameError && (
                      <p className="mt-1 text-xs font-bold text-[#E62719] flex items-center gap-1 font-outfit">
                        <span>⚠️</span>
                        <span>{joinNameError}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-[#1A1614] mb-1.5 font-outfit">
                      Room code
                    </label>
                    <input
                      type="text"
                      value={joinCode}
                      maxLength={6}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 6);
                        setJoinCode(val);
                        if (joinCodeError) setJoinCodeError(null);
                      }}
                      placeholder="Enter 6-char code"
                      className={`w-full px-4 py-2.5 sm:py-2.5 bg-[#F4EBD9] border-[1.5px] ${
                        joinCodeError ? 'border-[#E62719] ring-2 ring-[#E62719]/20' : 'border-[#D8CBB8]'
                      } rounded-xl text-sm font-outfit font-mono uppercase tracking-widest text-[#1A1614] placeholder:text-[#64594A] placeholder:tracking-normal focus:outline-none focus:border-[#E62719] focus:bg-white transition`}
                    />
                    {joinCodeError && (
                      <p className="mt-1 text-xs font-bold text-[#E62719] flex items-center gap-1 font-outfit">
                        <span>⚠️</span>
                        <span>{joinCodeError}</span>
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isJoining}
                    className="w-full mt-2 cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white rounded-full py-3 sm:py-3.5 px-4 font-modak text-xl sm:text-2xl tracking-wider border-[2.5px] border-[#18181B] shadow-[0_5px_0_#18181B] active:translate-y-[4px] active:shadow-[0_1px_0_#18181B] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:shadow-[0_5px_0_#18181B] transition-all flex items-center justify-center gap-2 select-none"
                  >
                    {isJoining ? (
                      <>
                        <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>JOINING...</span>
                      </>
                    ) : (
                      <span>JOIN ROOM</span>
                    )}
                  </button>
                </form>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          4. FOOTER
          ══════════════════════════════════════════════════════════════════════ */}
      <footer className={`relative z-20 flex flex-col items-center justify-center pb-3 flex-shrink-0 select-none ${
        contentReady ? 'animate-fade-rise' : 'opacity-0 pointer-events-none'
      }`}>
        <p className="font-comic font-bold text-xs sm:text-[13px] text-[#7A6E60] tracking-tight leading-none text-center">
          Watch YouTube together in perfect sync with friends.
        </p>
      </footer>

      {/* ══════════════════════════════════════════════════════════════════════
          5. CREATE ROOM MODAL POP-UP
          ══════════════════════════════════════════════════════════════════════ */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[3px] animate-fade-in"
          onClick={() => {
            setIsCreateModalOpen(false);
            setCreateError(null);
          }}
        >
          <div
            className="relative w-full max-w-[370px] bg-white rounded-[28px] border-[4.5px] border-[#383838] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.25)] select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => {
                setIsCreateModalOpen(false);
                setCreateError(null);
              }}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-[#F4EBD9] border-[2px] border-[#383838] hover:bg-[#EAE0CD] text-[#1A1614] font-bold text-base flex items-center justify-center cursor-pointer transition active:scale-95 shadow-[0_2px_0_#18181B]"
              aria-label="Close modal"
            >
              ✕
            </button>

            {/* Modal Title */}
            <div className="flex items-center justify-center mb-4 pt-1">
              <h3 className="font-mouse text-[#E62719] text-4xl sm:text-5xl uppercase tracking-wider leading-none text-center">
                CREATE A ROOM
              </h3>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-bold text-[#1A1614] mb-1.5 font-outfit">
                  Your name
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={createName}
                  onChange={(e) => {
                    setCreateName(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  placeholder="Enter your name"
                  autoFocus
                  className={`w-full px-4 py-2.5 bg-[#F4EBD9] border-[1.5px] ${
                    createError ? 'border-[#E62719] ring-2 ring-[#E62719]/20' : 'border-[#D8CBB8]'
                  } rounded-xl text-sm font-outfit text-[#1A1614] placeholder:text-[#64594A] focus:outline-none focus:border-[#E62719] focus:bg-white transition`}
                />
                {createError && (
                  <p className="mt-1 text-xs font-bold text-[#E62719] flex items-center gap-1 font-outfit">
                    <span>⚠️</span>
                    <span>{createError}</span>
                  </p>
                )}
              </div>

              {/* Host note: moved into Create Modal */}
              <div className="flex flex-col items-center justify-center py-2.5 px-3 bg-[#F4EBD9]/80 rounded-xl border border-[#D8CBB8]/70 text-center">
                <div className="flex items-center gap-2">
                  <HostDashesLeft />
                  <p className="font-comic font-bold text-sm sm:text-[15px] text-[#1A1614] leading-tight">
                    You&apos;ll be the Host.
                  </p>
                  <HostDashesRight />
                </div>
                <p className="font-comic font-bold text-xs text-[#64594A] mt-1 tracking-tight leading-none text-center">
                  Share the code/link with friends.
                </p>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full mt-1 cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white rounded-full py-3 px-4 font-modak text-xl tracking-wider border-[2.5px] border-[#18181B] shadow-[0_5px_0_#18181B] active:translate-y-[4px] active:shadow-[0_1px_0_#18181B] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:shadow-[0_5px_0_#18181B] transition-all flex items-center justify-center gap-2 select-none"
              >
                {isCreating ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>CREATING...</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl leading-none font-bold select-none">+</span>
                    <span>CREATE ROOM</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
