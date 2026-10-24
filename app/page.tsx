'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

// ─── Hand-drawn Doodle SVGs matching reference image exactly ───────────────

const TopRaysLeft = () => (
  <svg width="42" height="30" viewBox="0 0 42 30" fill="none" className="select-none pointer-events-none">
    <path d="M4 26 L12 6" stroke="#E62719" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M22 28 L20 2" stroke="#E62719" strokeWidth="3.8" strokeLinecap="round" />
    <path d="M38 28 L30 10" stroke="#E62719" strokeWidth="3.5" strokeLinecap="round" />
  </svg>
);

const TopRaysRight = () => (
  <svg width="42" height="30" viewBox="0 0 42 30" fill="none" className="select-none pointer-events-none">
    <path d="M6 10 L14 28" stroke="#E62719" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M22 2 L20 28" stroke="#E62719" strokeWidth="3.8" strokeLinecap="round" />
    <path d="M38 6 L30 26" stroke="#E62719" strokeWidth="3.5" strokeLinecap="round" />
  </svg>
);

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
  <svg width="65" height="50" viewBox="0 0 65 50" fill="none" className="select-none pointer-events-none">
    <path
      d="M10 8 C 16 32, 34 40, 52 38"
      stroke="#E62719"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <path
      d="M44 28 L54 38 L42 45"
      stroke="#E62719"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DoodleArrowRight = () => (
  <svg width="65" height="50" viewBox="0 0 65 50" fill="none" className="select-none pointer-events-none">
    <path
      d="M55 8 C 48 32, 30 40, 12 38"
      stroke="#E62719"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <path
      d="M22 28 L11 38 L24 45"
      stroke="#E62719"
      strokeWidth="3.2"
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

const CreateRoomSlashesLeft = () => (
  <svg width="24" height="20" viewBox="0 0 24 20" fill="none" className="select-none pointer-events-none">
    <path d="M4 16 L12 4" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M12 18 L20 6" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

const CreateRoomSlashesRight = () => (
  <svg width="24" height="20" viewBox="0 0 24 20" fill="none" className="select-none pointer-events-none">
    <path d="M12 4 L4 16" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M20 6 L12 18" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

const JoinRoomDashesLeft = () => (
  <svg width="26" height="22" viewBox="0 0 26 22" fill="none" className="select-none pointer-events-none">
    <path d="M4 5 L18 8" stroke="#E62719" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M2 11 L22 11" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M5 17 L19 14" stroke="#E62719" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

const JoinRoomDashesRight = () => (
  <svg width="26" height="22" viewBox="0 0 26 22" fill="none" className="select-none pointer-events-none">
    <path d="M22 5 L8 8" stroke="#E62719" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M24 11 L4 11" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M21 17 L7 14" stroke="#E62719" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

const HostDashesLeft = () => (
  <svg width="26" height="24" viewBox="0 0 26 24" fill="none" className="select-none pointer-events-none">
    <path d="M20 5 L6 10" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M22 12 L4 12" stroke="#E62719" strokeWidth="3" strokeLinecap="round" />
    <path d="M19 19 L7 14" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

const HostDashesRight = () => (
  <svg width="26" height="24" viewBox="0 0 26 24" fill="none" className="select-none pointer-events-none">
    <path d="M6 5 L20 10" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M4 12 L22 12" stroke="#E62719" strokeWidth="3" strokeLinecap="round" />
    <path d="M7 19 L19 14" stroke="#E62719" strokeWidth="2.8" strokeLinecap="round" />
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
  const [menuOpen, setMenuOpen] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      showToast('⚠️ Please enter your name first');
      return;
    }
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    showToast(`🎉 Creating room ${code}...`);
    setTimeout(() => {
      router.push(`/room/${code}?username=${encodeURIComponent(createName.trim())}`);
    }, 600);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinName.trim()) {
      showToast('⚠️ Please enter your name');
      return;
    }
    if (!joinCode.trim()) {
      showToast('⚠️ Please enter a room code');
      return;
    }
    const code = joinCode.trim().toUpperCase();
    showToast(`🍿 Joining room ${code}...`);
    setTimeout(() => {
      router.push(`/room/${code}?username=${encodeURIComponent(joinName.trim())}`);
    }, 600);
  };

  return (
    <div
      className="relative w-full min-h-screen xl:h-screen flex flex-col justify-between overflow-x-hidden selection:bg-red-500 selection:text-white"
      style={{ backgroundColor: '#F7EFE5' }}
    >
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-6 py-2.5 bg-[#1A1614] text-[#F7EFE5] text-sm font-semibold rounded-full shadow-2xl animate-fade-in pointer-events-none">
          {toast}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          1. TOP NAVIGATION
          ══════════════════════════════════════════════════════════════════════ */}
      <nav className="relative z-30 flex items-center justify-between px-6 sm:px-10 pt-5 pb-2 flex-shrink-0">
        {/* LOGO: Modak font in red */}
        <button
          onClick={() => router.push('/')}
          className="cursor-pointer hover:opacity-90 transition active:scale-95 text-left"
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
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════
          2. GIANT HERO HEADLINE: "WATCH YOUTUBE" & "TOGETHER, IN SYNC."
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-shrink-0 px-4 pt-1 pb-2">
        {/* Doodle rays above WATCH & YOUTUBE */}
        <div className="w-full max-w-4xl relative select-none pointer-events-none">
          <div className="absolute -top-3 left-[14%] sm:left-[17%]">
            <TopRaysLeft />
          </div>
          <div className="absolute -top-3 right-[14%] sm:right-[17%]">
            <TopRaysRight />
          </div>
        </div>

        {/* "WATCH YOUTUBE" — SVG textPath arch for mathematically even curve */}
        <div className="w-full max-w-[1060px] mx-auto select-none px-2" aria-label="WATCH YOUTUBE" style={{ marginBottom: '-1.5rem' }}>
          <svg
            viewBox="0 0 1300 270"
            className="w-full h-auto"
            style={{ overflow: 'visible' }}
          >
            <defs>
              {/* Upward arch path calibrated for large Anton SC headline */}
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
                href="#watchYoutubePath"
                startOffset="50%"
                textAnchor="middle"
              >
                WATCH YOUTUBE
              </textPath>
            </text>
          </svg>
        </div>

        {/* "TOGETHER, IN SYNC." - in MODAK font with a subtle arch curve, tucked right below WATCH YOUTUBE */}
        <div className="relative -mt-4 sm:-mt-8 md:-mt-18 w-full max-w-[620px] mx-auto flex flex-col items-center select-none z-20">
          <svg
            viewBox="0 0 800 120"
            className="w-full h-auto"
            style={{ overflow: 'visible' }}
          >
            <defs>
              {/* Very gentle upward arch to match the curve above */}
              <path
                id="togetherInSyncPath"
                d="M 30,100 A 2400,2400 0 0,1 770,100"
                fill="none"
              />
            </defs>
            <text
              style={{
                fontFamily: "'Modak', cursive",
                fontSize: '77px',
                fill: '#FFBA00',
                stroke: 'white',
                strokeWidth: '10px',
                paintOrder: 'stroke fill',
                strokeLinejoin: 'round',
                letterSpacing: '2px',
              }}
            >
              <textPath
                href="#togetherInSyncPath"
                startOffset="50%"
                textAnchor="middle"
              >
                TOGETHER, IN SYNC.
              </textPath>
            </text>
          </svg>

          {/* Hand-drawn red scribble underline */}
          <div className="w-[85%] sm:w-[92%] -mt-3 sm:-mt-5">
            <ScribbleUnderline />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          3. MAIN INTERACTION STAGE
             Left Character + Annotation | Two Central Cards | Right Character + List
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative flex items-end justify-center flex-1 w-full max-w-[1400px] mx-auto px-4 mt-2">

        {/* ── LEFT ANNOTATION: "DISTANCE FEELS CLOSER" ── */}
        <div
          className="absolute left-2 sm:left-6 lg:left-12 top-[8%] flex flex-col items-center select-none z-20 pointer-events-none"
          style={{ transform: 'rotate(-10deg)' }}
        >
          <span
            className="font-modak text-[#FFBA00] text-center uppercase leading-[1.05]"
            style={{
              fontSize: 'clamp(0.95rem, 1.8vw, 1.35rem)',
              WebkitTextStroke: '2.5px white',
              paintOrder: 'stroke fill',
              textShadow: '0 2px 0 #BA8400, 0 3px 2px rgba(0,0,0,0.15)',
            }}
          >
            DISTANCE<br />FEELS<br />CLOSER
          </span>
          <div className="mt-1 ml-4">
            <DoodleArrowLeft />
          </div>
        </div>

        {/* ── RIGHT ANNOTATION: "SAME VIDEO SAME VIBES" ── */}
        <div
          className="absolute right-2 sm:right-6 lg:right-12 top-[8%] flex flex-col items-center select-none z-20 pointer-events-none"
          style={{ transform: 'rotate(10deg)' }}
        >
          <span
            className="font-modak text-[#FFBA00] text-center uppercase leading-[1.05]"
            style={{
              fontSize: 'clamp(0.95rem, 1.8vw, 1.35rem)',
              WebkitTextStroke: '2.5px white',
              paintOrder: 'stroke fill',
              textShadow: '0 2px 0 #BA8400, 0 3px 2px rgba(0,0,0,0.15)',
            }}
          >
            SAME<br />VIDEO<br />SAME<br />VIBES
          </span>
          <div className="mt-1 mr-4">
            <DoodleArrowRight />
          </div>
        </div>

        {/* ── THREE COLUMN STAGE ── */}
        <div className="flex items-end justify-center w-full gap-2 sm:gap-4 lg:gap-6">

          {/* ─── LEFT CHARACTER (Anime boy + popcorn + laptop + doodles) ─── */}
          <div className="hidden md:flex flex-col items-center relative flex-shrink-0 self-end w-[220px] lg:w-[280px] xl:w-[320px]">
            {/* Doodle Crown above head */}
            <div className="absolute -top-7 left-[38%] -translate-x-1/2 z-20" style={{ transform: 'rotate(-12deg)' }}>
              <DoodleCrown />
            </div>

            {/* Sparkles around head */}
            <div className="absolute top-2 left-4 z-20">
              <YellowRays />
            </div>
            <div className="absolute top-4 right-8 z-20">
              <RedRaysSmall />
            </div>

            {/* Character Image */}
            <div className="w-full relative">
              <Image
                src="/char-left.jpg"
                alt="Boy watching YouTube party"
                width={320}
                height={400}
                className="w-full h-auto object-contain object-bottom select-none pointer-events-none"
                style={{ mixBlendMode: 'multiply' }}
                priority
              />
            </div>
          </div>

          {/* ─── CENTER: TWO CARDS ─── */}
          <div className="flex flex-col sm:flex-row gap-4 lg:gap-6 items-stretch justify-center flex-1 max-w-[680px] z-10 mb-4 sm:mb-6">

            {/* CARD 1: CREATE A ROOM */}
            <div
              className="flex-1 bg-white rounded-[26px] border-[2.8px] border-[#1A1614] p-5 sm:p-6 flex flex-col justify-between shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.09)] transition-all"
            >
              <div>
                {/* Title flanked with red doodle slashes */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <CreateRoomSlashesLeft />
                  <h3
                    className="font-mouse text-[#E62719] text-2xl sm:text-3xl lg:text-4xl uppercase tracking-wide leading-none select-none text-center"
                  >
                    CREATE A ROOM
                  </h3>
                  <CreateRoomSlashesRight />
                </div>

                <form onSubmit={handleCreate} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-[#1A1614] mb-1.5 font-outfit">
                      Your name
                    </label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-4 py-2.5 sm:py-3 bg-[#F7EFE5] border-[1.5px] border-[#DED4C7] rounded-xl text-sm font-outfit text-[#1A1614] placeholder:text-[#A89D90] focus:outline-none focus:border-[#E62719] focus:bg-white transition"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-2 cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white rounded-full py-3 sm:py-3.5 px-4 font-modak text-lg sm:text-xl tracking-wide flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-none select-none"
                  >
                    <span>CREATE ROOM</span>
                    <span className="text-xl sm:text-2xl leading-none">→</span>
                  </button>
                </form>
              </div>
            </div>

            {/* CARD 2: JOIN A ROOM */}
            <div
              className="flex-1 bg-white rounded-[26px] border-[2.8px] border-[#1A1614] p-5 sm:p-6 flex flex-col justify-between shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.09)] transition-all"
            >
              <div>
                {/* Title flanked with red doodle dashes */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <JoinRoomDashesLeft />
                  <h3
                    className="font-mouse text-[#E62719] text-2xl sm:text-3xl lg:text-4xl uppercase tracking-wide leading-none select-none text-center"
                  >
                    JOIN A ROOM
                  </h3>
                  <JoinRoomDashesRight />
                </div>

                <form onSubmit={handleJoin} className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-[#1A1614] mb-1.5 font-outfit">
                      Your name
                    </label>
                    <input
                      type="text"
                      value={joinName}
                      onChange={(e) => setJoinName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-4 py-2.5 sm:py-2.5 bg-[#F7EFE5] border-[1.5px] border-[#DED4C7] rounded-xl text-sm font-outfit text-[#1A1614] placeholder:text-[#A89D90] focus:outline-none focus:border-[#E62719] focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-[#1A1614] mb-1.5 font-outfit">
                      Room code
                    </label>
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter room code"
                      className="w-full px-4 py-2.5 sm:py-2.5 bg-[#F7EFE5] border-[1.5px] border-[#DED4C7] rounded-xl text-sm font-outfit font-mono uppercase tracking-wider text-[#1A1614] placeholder:text-[#A89D90] focus:outline-none focus:border-[#E62719] focus:bg-white transition"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-1 cursor-pointer bg-[#E62719] hover:bg-[#D41E11] text-white rounded-full py-3 sm:py-3.5 px-4 font-modak text-lg sm:text-xl tracking-wide flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-none select-none"
                  >
                    <span>JOIN ROOM</span>
                    <span className="text-xl sm:text-2xl leading-none">→</span>
                  </button>
                </form>
              </div>
            </div>

          </div>

          {/* ─── RIGHT CHARACTER (Ghost with popcorn) + MOVIE NIGHTS LIST ─── */}
          <div className="hidden md:flex flex-col items-center relative flex-shrink-0 self-end w-[220px] lg:w-[280px] xl:w-[320px]">
            {/* Annotation List on top-right of ghost */}
            <div
              className="absolute -top-12 sm:-top-8 -left-4 sm:-left-2 z-20 flex items-start gap-1 select-none pointer-events-none"
              style={{ transform: 'rotate(4deg)' }}
            >
              <div className="mt-1">
                <MovieNightDashes />
              </div>
              <div className="flex flex-col">
                {['MOVIE NIGHTS', 'REACTIONS', 'STUDY TOGETHER', 'ANYTHING'].map((item) => (
                  <span
                    key={item}
                    className="font-mouse text-[#1A1614] text-xs sm:text-sm lg:text-base leading-[1.15] font-black uppercase tracking-wide"
                  >
                    {item}
                  </span>
                ))}
                <div className="ml-auto mt-0.5">
                  <CurlyArrowBesideGhost />
                </div>
              </div>
            </div>

            {/* Character Image */}
            <div className="w-full relative">
              <Image
                src="/char-right.jpg"
                alt="Ghost buddy eating popcorn"
                width={320}
                height={400}
                className="w-full h-auto object-cover object-top rounded-3xl select-none pointer-events-none"
                style={{ maxHeight: '310px' }}
                priority
              />
            </div>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          4. FOOTER: "You'll be the Host. Share the code/link with friends."
          ══════════════════════════════════════════════════════════════════════ */}
      <footer className="relative z-20 flex flex-col items-center justify-center pb-4 pt-1 flex-shrink-0 select-none">
        <div className="flex items-center gap-2 sm:gap-3">
          <HostDashesLeft />
          <p className="font-outfit font-bold text-sm sm:text-base text-[#1A1614]">
            You&apos;ll be the Host.
          </p>
          <HostDashesRight />
        </div>
        <p className="font-outfit text-xs sm:text-sm text-[#7A6F64] mt-0.5">
          Share the code/link with friends.
        </p>
      </footer>
    </div>
  );
}
